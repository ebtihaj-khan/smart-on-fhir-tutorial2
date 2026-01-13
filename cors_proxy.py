#!/usr/bin/env python3
"""
Simple CORS Proxy for FHIR Requests
Forwards requests to Cerner's FHIR server and adds CORS headers
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import urllib.request
import urllib.error
import json
import sys

class CORSProxyHandler(BaseHTTPRequestHandler):
    
    def do_OPTIONS(self):
        """Handle preflight OPTIONS requests"""
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()
    
    def do_GET(self):
        """Handle GET requests"""
        self.proxy_request('GET')
    
    def do_POST(self):
        """Handle POST requests"""
        self.proxy_request('POST')
    
    def do_PUT(self):
        """Handle PUT requests"""
        self.proxy_request('PUT')
    
    def send_cors_headers(self):
        """Add CORS headers to allow cross-origin requests"""
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept')
        self.send_header('Access-Control-Max-Age', '86400')
    
    def proxy_request(self, method):
        """Forward the request to the target server"""
        try:
            # Get the target URL from the request path (remove leading slash)
            target_url = self.path[1:] if self.path.startswith('/') else self.path
            
            # If the path doesn't start with http, it's a relative path
            if not target_url.startswith('http'):
                self.send_error(400, 'Invalid URL. Please provide full URL.')
                return
            
            print(f'\n[PROXY] {method} {target_url}')
            
            # Get request headers
            headers = {}
            for header, value in self.headers.items():
                # Skip host header as it will be set by urllib
                if header.lower() not in ['host', 'connection']:
                    headers[header] = value
            
            # Ensure Accept header for FHIR
            if 'Accept' not in headers:
                headers['Accept'] = 'application/fhir+json'
            
            print(f'[PROXY] Request headers: {json.dumps(dict(headers), indent=2)}')
            
            # Read request body for POST/PUT
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length) if content_length > 0 else None
            
            # Create the request
            req = urllib.request.Request(
                target_url,
                data=body,
                headers=headers,
                method=method
            )
            
            # Send the request
            with urllib.request.urlopen(req) as response:
                response_data = response.read()
                
                # Send response
                self.send_response(response.status)
                
                # Add CORS headers
                self.send_cors_headers()
                
                # Copy response headers (skip CORS and transfer headers from origin)
                skip_headers = {
                    'transfer-encoding', 'connection',
                    'access-control-allow-origin', 'access-control-allow-methods', 
                    'access-control-allow-headers', 'access-control-max-age',
                    'access-control-allow-credentials', 'access-control-expose-headers'
                }
                for header, value in response.headers.items():
                    if header.lower() not in skip_headers:
                        self.send_header(header, value)
                
                self.end_headers()
                self.wfile.write(response_data)
                
                print(f'[PROXY] Response: {response.status} ({len(response_data)} bytes)')
                
        except urllib.error.HTTPError as e:
            print(f'[PROXY] HTTP Error: {e.code} {e.reason}')
            error_body = e.read()
            print(f'[PROXY] Error response: {error_body.decode("utf-8", errors="ignore")}')
            
            self.send_response(e.code)
            self.send_cors_headers()
            
            # Copy error response headers (skip CORS and transfer headers from origin)
            skip_headers = {
                'transfer-encoding', 'connection',
                'access-control-allow-origin', 'access-control-allow-methods', 
                'access-control-allow-headers', 'access-control-max-age',
                'access-control-allow-credentials', 'access-control-expose-headers'
            }
            for header, value in e.headers.items():
                if header.lower() not in skip_headers:
                    self.send_header(header, value)
            
            self.end_headers()
            self.wfile.write(error_body)
            
        except urllib.error.URLError as e:
            print(f'[PROXY] URL Error: {e.reason}')
            self.send_error(502, f'Bad Gateway: {e.reason}')
            
        except Exception as e:
            print(f'[PROXY] Error: {str(e)}')
            import traceback
            traceback.print_exc()
            self.send_error(500, f'Internal Server Error: {str(e)}')
    
    def log_message(self, format, *args):
        """Custom log format"""
        pass  # Suppress default logging, we'll do our own

def run_proxy(port=8081):
    """Start the CORS proxy server"""
    server_address = ('', port)
    httpd = HTTPServer(server_address, CORSProxyHandler)
    
    print(f'\n{"="*60}')
    print(f'🔧 CORS Proxy Server Running on port {port}')
    print(f'{"="*60}')
    print(f'\nUsage in your app:')
    print(f'  Instead of: https://fhir-ehr-code.cerner.com/...')
    print(f'  Use:        http://localhost:{port}/https://fhir-ehr-code.cerner.com/...')
    print(f'\nPress Ctrl+C to stop\n')
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\n\n[PROXY] Shutting down...')
        httpd.shutdown()
        sys.exit(0)

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8081
    run_proxy(port)
