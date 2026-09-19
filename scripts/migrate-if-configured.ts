if (process.env.DATABASE_URL) {
  import('./migrate').catch(() => { console.error('Migration could not start.'); process.exitCode = 1; });
} else {
  console.log('No DATABASE_URL: building public website with booking disabled.');
}
