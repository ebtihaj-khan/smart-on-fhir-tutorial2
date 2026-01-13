#!/bin/bash

# Simple script to start the app server
echo "Starting App Server on port 443..."
echo "Open: http://localhost:443/launch.html"
echo "Press Ctrl+C to stop"
echo ""

cd "$(dirname "$0")"
python3 -m http.server 443
