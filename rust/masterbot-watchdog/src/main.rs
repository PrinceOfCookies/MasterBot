// icl ts was like 90% ai, idk rust rn, but i do plan to look through and rewrite bad stuff here!!
// I mean hey atleast i understand most of it! 

use anyhow::{anyhow, Context, Result};
use clap::Parser;
use serde::Serialize;
use serde_json::Value;
use std::collections::BTreeMap;
use std::process::Command;
use std::thread;
use std::time::Duration;
use sysinfo::System;

const WATCHDOG_NAME: &str = "masterbot-watchdog";
const WATCHDOG_MARKER: &str = "MASTERBOT_WATCHDOG";
const CONTROL_MARKER: &str = "MASTERBOT_CONTROL";
const BOT_NAME_MARKER: &str = "BOT_NAME";
const RESERVE_PERCENT: f64 = 5.0;
const CPU_LOW_THRESHOLD: f64 = 30.0;
const MEMORY_LOW_THRESHOLD_MB: u64 = 350;

#[derive(Parser, Debug)]
#[command(author, version, about)]
struct Cli {
    #[arg(long)]
    json: bool,

    #[arg(long)]
    watch: bool,

    #[arg(long, default_value_t = 10)]
    interval: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BotStatus {
    name: String,
    status: String,
    pid: i64,
    memory_mb: u64,
    cpu_percent: f64,
    restart_count: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Allocation {
    bot_count: usize,
    cpu_percent_per_bot: f64,
    memory_mb_per_bot: u64,
    cpu_too_low: bool,
    memory_too_low: bool,
}

#[derive(Debug, Clone, Serialize)]
struct Snapshot {
    bots: Vec<BotStatus>,
    allocation: Allocation,
}

#[derive(Debug, Clone)]
struct ProcessState {
    name: String,
    status: String,
    pid: i64,
    memory_mb: u64,
    cpu_percent: f64,
    restart_count: u64,
}

#[derive(Debug, Default, Clone)]
struct ProcessDelta {
    name: String,
    old_status: Option<String>,
    new_status: Option<String>,
    old_pid: Option<i64>,
    new_pid: Option<i64>,
    old_restart_count: Option<u64>,
    new_restart_count: Option<u64>,
}

fn run_pm2_jlist() -> Result<Vec<Value>> {
    let output = Command::new("npx")
        .args(["pm2", "jlist"])
        .output()
        .context("failed to execute `npx pm2 jlist`")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let reason = if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            format!("exit status {}", output.status)
        };

        return Err(anyhow!("`npx pm2 jlist` failed: {reason}"));
    }

    let stdout = String::from_utf8(output.stdout).context("PM2 jlist output was not valid UTF-8")?;
    let trimmed = stdout.trim();

    if trimmed.is_empty() {
        return Ok(Vec::new());
    }

    let parsed: Value = serde_json::from_str(trimmed).context("failed to parse PM2 jlist JSON")?;

    Ok(parsed.as_array().cloned().unwrap_or_default())
}

fn value_as_string(value: Option<&Value>) -> Option<String> {
    value.and_then(Value::as_str).map(|value| value.to_string())
}

fn value_as_i64(value: Option<&Value>) -> Option<i64> {
    value.and_then(|value| {
        if let Some(number) = value.as_i64() {
            Some(number)
        } else if let Some(number) = value.as_u64() {
            i64::try_from(number).ok()
        } else if let Some(number) = value.as_f64() {
            Some(number as i64)
        } else {
            None
        }
    })
}

fn value_as_u64(value: Option<&Value>) -> Option<u64> {
    value.and_then(|value| {
        if let Some(number) = value.as_u64() {
            Some(number)
        } else if let Some(number) = value.as_i64() {
            if number >= 0 {
                Some(number as u64)
            } else {
                None
            }
        } else if let Some(number) = value.as_f64() {
            if number >= 0.0 {
                Some(number.floor() as u64)
            } else {
                None
            }
        } else {
            None
        }
    })
}

fn value_as_f64(value: Option<&Value>) -> Option<f64> {
    value.and_then(|value| {
        if let Some(number) = value.as_f64() {
            Some(number)
        } else if let Some(number) = value.as_i64() {
            Some(number as f64)
        } else if let Some(number) = value.as_u64() {
            Some(number as f64)
        } else {
            None
        }
    })
}

fn env_object(process: &Value) -> Option<&serde_json::Map<String, Value>> {
    process
        .get("pm2_env")
        .and_then(|pm2_env| pm2_env.get("env"))
        .and_then(Value::as_object)
}

fn pm2_env_object(process: &Value) -> Option<&serde_json::Map<String, Value>> {
    process.get("pm2_env").and_then(Value::as_object)
}

fn is_watchdog_process(process: &Value) -> bool {
	let name = value_as_string(process.get("name"));
	let env = env_object(process);
	let marker = env
		.and_then(|env| env.get(WATCHDOG_MARKER))
		.and_then(Value::as_str)
		.unwrap_or("");

	name.as_deref() == Some(WATCHDOG_NAME) || marker == "1"
}

fn is_control_process(process: &Value) -> bool {
	let env = env_object(process);
	let marker = env
		.and_then(|env| env.get(CONTROL_MARKER))
		.and_then(Value::as_str)
		.unwrap_or("");

	marker == "1"
}

fn is_bot_process(process: &Value) -> bool {
	if is_watchdog_process(process) || is_control_process(process) {
		return false;
	}

    env_object(process)
        .and_then(|env| env.get(BOT_NAME_MARKER))
        .and_then(Value::as_str)
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false)
}

fn process_name(process: &Value) -> Option<String> {
	if is_control_process(process) {
		return None;
	}

	env_object(process)
		.and_then(|env| env.get(BOT_NAME_MARKER))
		.and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(|value| value.to_string())
        .or_else(|| value_as_string(process.get("name")))
}

fn process_state(process: &Value) -> Option<ProcessState> {
    let name = process_name(process)?;
    let pm2_env = pm2_env_object(process)?;
    let monit = process.get("monit").and_then(Value::as_object);
    let memory_bytes = value_as_u64(monit.and_then(|monit| monit.get("memory"))).unwrap_or(0);
    let memory_mb = memory_bytes / 1024 / 1024;
    let cpu_percent = value_as_f64(monit.and_then(|monit| monit.get("cpu"))).unwrap_or(0.0);
    let status = value_as_string(pm2_env.get("status")).unwrap_or_else(|| "unknown".to_string());
    let pid = value_as_i64(pm2_env.get("pid"))
        .or_else(|| value_as_i64(process.get("pid")))
        .unwrap_or(-1);
    let restart_count = value_as_u64(pm2_env.get("restart_time")).unwrap_or(0);

    Some(ProcessState {
        name,
        status,
        pid,
        memory_mb,
        cpu_percent,
        restart_count,
    })
}

fn read_processes() -> Result<Vec<ProcessState>> {
    let processes = run_pm2_jlist()?;

    Ok(processes
        .into_iter()
        .filter(is_bot_process)
        .filter_map(|process| process_state(&process))
        .collect())
}

fn system_memory_mb() -> u64 {
    let mut system = System::new_all();
    system.refresh_memory();
    system.total_memory() / 1024 / 1024
}

fn calculate_allocation(bot_count: usize) -> Allocation {
    let cpu_budget = 100.0 - RESERVE_PERCENT;
    let memory_budget_mb = ((system_memory_mb() as f64) * 0.95).floor() as u64;

    let cpu_percent_per_bot = if bot_count > 0 {
        cpu_budget / bot_count as f64
    } else {
        0.0
    };

    let memory_mb_per_bot = if bot_count > 0 {
        memory_budget_mb / bot_count as u64
    } else {
        0
    };

    Allocation {
        bot_count,
        cpu_percent_per_bot,
        memory_mb_per_bot,
        cpu_too_low: bot_count > 0 && cpu_percent_per_bot < CPU_LOW_THRESHOLD,
        memory_too_low: bot_count > 0 && memory_mb_per_bot <= MEMORY_LOW_THRESHOLD_MB,
    }
}

fn to_snapshot(processes: &[ProcessState]) -> Snapshot {
    let bots = processes
        .iter()
        .map(|process| BotStatus {
            name: process.name.clone(),
            status: process.status.clone(),
            pid: process.pid,
            memory_mb: process.memory_mb,
            cpu_percent: process.cpu_percent,
            restart_count: process.restart_count,
        })
        .collect::<Vec<_>>();

    let allocation = calculate_allocation(bots.len());

    Snapshot { bots, allocation }
}

fn print_human_snapshot(snapshot: &Snapshot) {
    println!(
        "[watchdog] guardrail allocation: botCount={} cpuPercentPerBot={:.2}% memoryMbPerBot={} reserve=5%",
        snapshot.allocation.bot_count,
        snapshot.allocation.cpu_percent_per_bot,
        snapshot.allocation.memory_mb_per_bot
    );

    if snapshot.allocation.cpu_too_low {
        println!("[watchdog] warning: CPU allocation per bot is below 30%");
    }

    if snapshot.allocation.memory_too_low {
        println!("[watchdog] warning: memory allocation per bot is at or below 350MB");
    }

    for bot in &snapshot.bots {
        println!(
            "[watchdog] {} {} pid={} memory={}MB cpu={:.1} restarts={}",
            bot.name,
            bot.status,
            bot.pid,
            bot.memory_mb,
            bot.cpu_percent,
            bot.restart_count
        );
    }
}

fn print_json_snapshot(snapshot: &Snapshot) -> Result<()> {
    let json = serde_json::to_string_pretty(snapshot)?;
    println!("{json}");
    Ok(())
}

fn snapshot_by_name(processes: &[ProcessState]) -> BTreeMap<String, ProcessState> {
    processes
        .iter()
        .cloned()
        .map(|process| (process.name.clone(), process))
        .collect()
}

fn build_deltas(previous: &BTreeMap<String, ProcessState>, current: &BTreeMap<String, ProcessState>) -> Vec<ProcessDelta> {
    let mut names = previous.keys().cloned().collect::<Vec<_>>();

    for name in current.keys() {
        if !previous.contains_key(name) {
            names.push(name.clone());
        }
    }

    names.sort();
    names.dedup();

    let mut deltas = Vec::new();

    for name in names {
        let old = previous.get(&name);
        let new = current.get(&name);

        let old_status = old.map(|process| process.status.clone());
        let new_status = new.map(|process| process.status.clone());
        let old_pid = old.map(|process| process.pid);
        let new_pid = new.map(|process| process.pid);
        let old_restart_count = old.map(|process| process.restart_count);
        let new_restart_count = new.map(|process| process.restart_count);

        let status_changed = old_status != new_status;
        let pid_changed = old_pid != new_pid;
        let restart_increased = match (old_restart_count, new_restart_count) {
            (Some(previous), Some(current)) => current > previous,
            (None, Some(_)) => true,
            _ => false,
        };

        if status_changed || pid_changed || restart_increased || old.is_none() || new.is_none() {
            deltas.push(ProcessDelta {
                name,
                old_status,
                new_status,
                old_pid,
                new_pid,
                old_restart_count,
                new_restart_count,
            });
        }
    }

    deltas
}

fn print_deltas(deltas: &[ProcessDelta]) {
    for delta in deltas {
        match (&delta.old_status, &delta.new_status) {
            (Some(old_status), Some(new_status)) if old_status != new_status => {
                println!(
                    "[watchdog] status change {} {} -> {}",
                    delta.name, old_status, new_status
                );
            }
            (None, Some(new_status)) => {
                println!("[watchdog] detected {} status={}", delta.name, new_status);
            }
            (Some(old_status), None) => {
                println!("[watchdog] process missing {} last_status={}", delta.name, old_status);
                continue;
            }
            _ => {}
        }

        if let (Some(old_restart), Some(new_restart)) = (delta.old_restart_count, delta.new_restart_count) {
            if new_restart > old_restart {
                println!(
                    "[watchdog] restart increase {} {} -> {}",
                    delta.name, old_restart, new_restart
                );
            }
        } else if delta.old_restart_count.is_none() && delta.new_restart_count.is_some() {
            println!(
                "[watchdog] restart count available {}={}",
                delta.name,
                delta.new_restart_count.unwrap_or(0)
            );
        }

        if delta.old_pid != delta.new_pid {
            if let Some(pid) = delta.new_pid {
                println!("[watchdog] pid change {} pid={}", delta.name, pid);
            }
        }
    }
}

fn run_once(json_mode: bool) -> Result<(Snapshot, BTreeMap<String, ProcessState>)> {
    let processes = read_processes()?;
    let snapshot = to_snapshot(&processes);
    let current_map = snapshot_by_name(&processes);

    if json_mode {
        print_json_snapshot(&snapshot)?;
    } else {
        print_human_snapshot(&snapshot);
    }

    Ok((snapshot, current_map))
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    let interval = cli.interval.max(1);

    if !cli.watch {
        let _ = run_once(cli.json)?;
        return Ok(());
    }

    let mut previous_map = BTreeMap::new();

    loop {
        let (_snapshot, current_map) = run_once(cli.json)?;

        if !previous_map.is_empty() {
            let deltas = build_deltas(&previous_map, &current_map);
            if !deltas.is_empty() {
                print_deltas(&deltas);
            }
        }

        previous_map = current_map;

        thread::sleep(Duration::from_secs(interval));
    }
}
