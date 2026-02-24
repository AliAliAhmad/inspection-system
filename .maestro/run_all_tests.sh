#!/bin/bash
# Run all Maestro login tests sequentially
# Handles Expo Dev Launcher automatically before starting tests

MAESTRO=~/.maestro/bin/maestro
APP_ID="com.inspection.system"

echo "=== Preparing emulator ==="

# Force-stop app
adb shell am force-stop $APP_ID
sleep 2

# Launch app
adb shell am start -n $APP_ID/.MainActivity
echo "Waiting for app to load..."

# Wait for Dev Launcher or Dashboard (up to 30s)
for i in $(seq 1 30); do
    sleep 1
    UI=$(adb shell uiautomator dump /sdcard/ui.xml 2>/dev/null && adb shell cat /sdcard/ui.xml 2>/dev/null)

    if echo "$UI" | grep -q "Development Build"; then
        echo "Dev Launcher detected - tapping Metro URL..."
        # Tap http://10.0.2.2:8081 button
        adb shell input tap 540 561
        echo "Waiting for app to connect to Metro..."
        sleep 30
        break
    fi

    if echo "$UI" | grep -q "Dashboard"; then
        echo "App loaded directly to Dashboard!"
        break
    fi

    if echo "$UI" | grep -q "Sign in"; then
        echo "App loaded to Login screen!"
        break
    fi
done

# Verify app is on Dashboard
echo "Checking app state..."
sleep 5
UI=$(adb shell uiautomator dump /sdcard/ui.xml 2>/dev/null && adb shell cat /sdcard/ui.xml 2>/dev/null)
if echo "$UI" | grep -q "Dashboard\|Good Morning\|Sign in"; then
    echo "App ready!"
else
    echo "WARNING: App may not be ready. Waiting 30 more seconds..."
    sleep 30
fi

echo ""
echo "=== Running Maestro Tests ==="
echo ""

TESTS=(
    "login_admin.yaml"
    "login_inspector.yaml"
    "login_engineer.yaml"
    "login_specialist.yaml"
    "login_maintenance.yaml"
    "login_test.yaml"
)

PASSED=0
FAILED=0

for test in "${TESTS[@]}"; do
    echo "--- Running $test ---"
    if $MAESTRO test .maestro/$test; then
        echo "PASSED: $test"
        ((PASSED++))
    else
        echo "FAILED: $test"
        ((FAILED++))
    fi
    echo ""
done

echo "=== Results ==="
echo "Passed: $PASSED / ${#TESTS[@]}"
echo "Failed: $FAILED / ${#TESTS[@]}"

if [ $FAILED -eq 0 ]; then
    echo "ALL TESTS PASSED!"
else
    echo "Some tests failed."
    exit 1
fi
