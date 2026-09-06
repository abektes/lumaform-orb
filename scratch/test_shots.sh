#!/bin/bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT="/Users/ahmetbektes/.gemini/antigravity/brain/f62b054c-46f7-4f3b-a9ff-63ccd1180796/screenshots"
PROFILE="/Users/ahmetbektes/.gemini/antigravity/brain/f62b054c-46f7-4f3b-a9ff-63ccd1180796/scratch/chrome-profile"

mkdir -p "$OUT" "$PROFILE"

run_shot() {
  local name="$1"
  local url="$2"
  echo "Taking screenshot for $name..."
  "$CHROME" \
    --headless=new \
    --user-data-dir="$PROFILE" \
    --disable-crash-reporter \
    --disable-dev-shm-usage \
    --window-size=1280,800 \
    --screenshot="$OUT/$name.png" \
    "$url" > /dev/null 2>&1 &
  local pid=$!
  sleep 7
  kill -9 $pid 2>/dev/null || true
}

run_shot "shot_nebula" "http://localhost:5173/?engine=nebula"
run_shot "shot_quantum" "http://localhost:5173/?engine=quantum"
run_shot "shot_fluid" "http://localhost:5173/?engine=fluid"
run_shot "shot_singularity" "http://localhost:5173/?engine=singularity"

echo "All done!"
