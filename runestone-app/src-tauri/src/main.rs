// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  // Single source: project root .env (runestone-app/.env)
  let _ = dotenvy::from_filename("../.env");
  app_lib::run();
}
