#!/bin/bash

# Start script for running the FH PA Dashboard on localhost

echo "=========================================="
echo "🚀 Starting FH PA Dashboard on Localhost"
echo "=========================================="
echo ""

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Check if Python 3 is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Error: Python 3 is not installed"
    echo "Please install Python 3 to run this application"
    exit 1
fi

# Check if port 443 is available
if lsof -Pi :443 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "⚠️  Warning: Port 443 is already in use"
    echo "You may need to stop the existing process or use a different port"
    echo ""
    read -p "Do you want to continue anyway? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo "📁 Project directory: $SCRIPT_DIR"
echo "🌐 Starting HTTP server on port 443..."
echo ""
echo "📍 Access the app at:"
echo "   http://localhost:443/index.html"
echo ""
echo "🚀 Launch from SMART Health IT:"
echo "   https://launch.smarthealthit.org/v/r4/fhir"
echo ""
echo "   Or use the launch page:"
echo "   http://localhost:443/launch.html"
echo ""
echo "Press Ctrl+C to stop the server"
echo "=========================================="
echo ""

# Start the HTTP server
# Try without sudo first, then with sudo if needed
python3 -m http.server 443 2>&1 || {
    echo ""
    echo "⚠️  Port 443 requires elevated permissions"
    echo "Attempting with sudo..."
    echo ""
    sudo python3 -m http.server 443
}
