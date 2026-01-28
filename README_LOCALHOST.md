# Running the FH PA Dashboard on Localhost

## Quick Start

### Option 1: Using Python HTTP Server (Recommended)

1. **Navigate to the project directory:**
   ```bash
   cd "/Users/ebtihaj/Documents/FHIR Cerner /smart-on-fhir-tutorial2"
   ```

2. **Start the HTTP server on port 443:**
   ```bash
   python3 -m http.server 443
   ```
   
   Or if port 443 requires sudo:
   ```bash
   sudo python3 -m http.server 443
   ```

3. **Open your browser and navigate to:**
   ```
   http://localhost:443/index.html
   ```

4. **Launch the app from SMART Health IT Sandbox:**
   - Go to: https://launch.smarthealthit.org/v/r4/fhir
   - Or use the launch page: http://localhost:443/launch.html

### Option 2: Using Node.js (if you have it installed)

1. **Install http-server globally (if not already installed):**
   ```bash
   npm install -g http-server
   ```

2. **Start the server:**
   ```bash
   http-server -p 443
   ```

3. **Open your browser:**
   ```
   http://localhost:443/index.html
   ```

## Important Notes

### Port 443
- The application is configured to run on **port 443** for localhost
- If port 443 is already in use or requires special permissions, you can:
  1. Change the port in `config.js` (update `redirectUri` and `launchUri`)
  2. Use a different port and update the configuration accordingly

### CORS Proxy (Optional)
- The CORS proxy (`cors_proxy.py`) is **NOT needed** for localhost
- It's only used when deployed and accessing Cerner endpoints
- For localhost with SMART Health IT sandbox, the proxy is not required

### Launching the App
- The app must be launched from an EHR system or SMART Health IT sandbox
- Direct access to `index.html` will show an error message
- Use the launch page: `http://localhost:443/launch.html`
- Or launch from: https://launch.smarthealthit.org/v/r4/fhir

## Troubleshooting

### Port Already in Use
If port 443 is already in use:
```bash
# Find what's using port 443
lsof -i :443

# Kill the process if needed
kill -9 <PID>
```

### Permission Denied (Port 443)
Ports below 1024 require sudo on macOS/Linux:
```bash
sudo python3 -m http.server 443
```

### Alternative Port
If you want to use a different port (e.g., 8000):
1. Update `config.js`:
   ```javascript
   local: {
     redirectUri: 'http://localhost:8000/index.html',
     redirectUriBase: 'http://localhost:8000/',
     launchUri: 'http://localhost:8000/launch.html',
     baseUrl: 'http://localhost:8000'
   }
   ```
2. Start server on that port:
   ```bash
   python3 -m http.server 8000
   ```

## Configuration

The app automatically detects localhost vs deployed environment:
- **Localhost**: Uses Client ID `3e0b9045-0ea9-432a-848f-cccfed325142`
- **Deployed**: Uses Client ID `f60d64fd-1ca1-4986-a661-bc28f2fc3ff7`

Configuration is in `config.js` and is automatically selected based on the hostname.
