#!/bin/bash

# Simple script to start the CORS proxy
echo "Starting CORS Proxy on port 8081..."
echo "Press Ctrl+C to stop"
echo ""

cd "$(dirname "$0")"
python3 cors_proxy.py 8081
