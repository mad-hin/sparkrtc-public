import os
import json
import requests
import argparse
from datetime import datetime
from pathlib import Path
from requests.models import Response
from urllib.parse import urlparse

class PostPreservingHTTPRedirectHandler(requests.adapters.HTTPAdapter):
    """Custom adapter that preserves POST method on 301/302 redirects"""
    def send(self, request, **kwargs):
        response = super().send(request, **kwargs)
        
        # Handle 301, 302, 303, 307, 308 redirects
        if response.status_code in [301, 302, 303, 307, 308]:
            # For 307 and 308, always preserve the method
            # For others, convert to GET unless it's 307/308
            if response.status_code in [307, 308]:
                # Preserve POST method
                new_request = request.copy()
                new_request.url = response.headers['location']
                new_response = super().send(new_request, **kwargs)
                return new_response
            elif response.status_code == 303:
                # 303 always becomes GET
                pass
            else:
                # For 301, 302 - try to preserve POST
                new_request = request.copy()
                new_request.url = response.headers['location']
                new_response = super().send(new_request, **kwargs)
                return new_response
        
        return response

def read_log_file(file_path):
    """Read log file and return contents"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return f.read()
    except UnicodeDecodeError:
        # Try with different encoding if UTF-8 fails
        with open(file_path, 'r', encoding='latin-1') as f:
            return f.read()
    except Exception as e:
        return f"Error reading file {file_path}: {str(e)}"

def collect_logs(output_dir, data_name):
    """
    Collect all generated log files from the experiment output
    
    Args:
        output_dir: The output directory path (e.g., 'exp1/method1')
        data_name: The data/video name used in the experiment
    
    Returns:
        Dictionary containing all log file contents
    """
    logs = {
        'timestamp': datetime.now().isoformat(),
        'output_dir': output_dir,
        'data_name': data_name,
        'host': os.uname().nodename if hasattr(os, 'uname') else 'unknown',
        'files': {},
        'metadata': {}  # Separate dictionary for metadata
    }
    
    # Base directories
    res_dir = f"../result/{output_dir}/res/{data_name}/"
    rec_dir = f"../result/{output_dir}/rec/{data_name}/"
    
    # Log files to collect
    log_files = {
        # Main result files
        'ssim': f"{res_dir}ssim/ssim.log",
        'psnr': f"{res_dir}psnr/psnr.log",
        'delay': f"{res_dir}delay.log",
        'frame_size': f"{res_dir}frame_size.log",
        'rate': f"{res_dir}rate.log",
        'rate_with_frame_index': f"{res_dir}rate_with_frame_index.log",
        'receive_corresponding_index': f"{res_dir}receive_correspoding_index.log",
        
        # Process logs
        'send_log': f"{rec_dir}send.log",
        'recv_log': f"{rec_dir}recv.log",
        'rate_timestamp': f"{rec_dir}rate_timestamp.log",
        'frame_size_timestamp': f"{rec_dir}frame_size_original_timestamp.log",
    }
    
    # Collect statistics files
    statistics_log = "../statistics.log"
    statistics_csv = "../statistics.csv"
    
    if os.path.exists(statistics_log):
        log_files['statistics_log'] = statistics_log
    if os.path.exists(statistics_csv):
        log_files['statistics_csv'] = statistics_csv
    
    # Read all available log files
    for log_name, file_path in log_files.items():
        if os.path.exists(file_path):
            logs['files'][log_name] = read_log_file(file_path)
            
            # Add file metadata to separate metadata dictionary
            try:
                file_stats = os.stat(file_path)
                logs['metadata'][log_name] = {
                    'size_bytes': file_stats.st_size,
                    'modified': datetime.fromtimestamp(file_stats.st_mtime).isoformat(),
                    'lines': len(logs['files'][log_name].split('\n'))
                }
            except Exception as e:
                logs['metadata'][log_name] = {
                    'error': str(e)
                }
        else:
            logs['files'][log_name] = f"File not found: {file_path}"
    
    return logs

def send_to_webhook(webhook_url, payload, timeout=30):
    """
    Send log data to webhook endpoint with n8n compatibility
    Handle 301 redirects while preserving POST method
    
    Args:
        webhook_url: The destination webhook URL
        payload: Dictionary containing log data
        timeout: Request timeout in seconds
    
    Returns:
        Response object if successful, None otherwise
    """
    try:
        headers = {
            'User-Agent': 'Experiment-Log-Sender/1.0',
            'X-Experiment-Type': 'video_quality_metrics',
            'Content-Type': 'application/json'
        }
        
        # Convert payload to JSON string
        json_data = json.dumps(payload)
        print(f"Sending payload of size: {len(json_data)} bytes")
        print(f"Payload structure: timestamp, output_dir, data_name, host, files, metadata")
        
        # Create a session with custom adapter to handle redirects while preserving POST
        session = requests.Session()
        
        # Mount the custom adapter for both http and https
        adapter = PostPreservingHTTPRedirectHandler()
        session.mount('http://', adapter)
        session.mount('https://', adapter)
        
        # Make the request
        response = session.post(
            webhook_url,
            data=json_data,
            headers=headers,
            timeout=timeout,
            allow_redirects=False  # We handle redirects manually
        )
        
        print(f"Response status: {response.status_code}")
        print(f"Response URL: {response.url}")
        
        if response.status_code in [200, 201, 202]:
            print(f"✓ Successfully sent logs to webhook")
            if response.text:
                try:
                    response_data = response.json()
                    print(f"Response data: {json.dumps(response_data, indent=2)}")
                except:
                    print(f"Response text: {response.text[:500]}")
            return response
        else:
            print(f"✗ Webhook returned status {response.status_code}")
            print(f"Response: {response.text[:500] if response.text else 'No response body'}")
            return None
            
    except requests.exceptions.Timeout:
        print(f"✗ Request timeout after {timeout} seconds")
        return None
    except requests.exceptions.ConnectionError as e:
        print(f"✗ Connection error: {str(e)}")
        return None
    except requests.exceptions.RequestException as e:
        print(f"✗ Request failed: {str(e)}")
        return None

def send_logs_to_webhook(webhook_url, output_dir, data_name):
    """
    Main function to collect logs and send to webhook
    
    Args:
        webhook_url: The destination webhook URL
        output_dir: The output directory from the experiment
        data_name: The data/video name used in the experiment
    """
    print(f"=== Starting Log Collection ===")
    print(f"Output Directory: {output_dir}")
    print(f"Data Name: {data_name}")
    print(f"Webhook URL: {webhook_url}")
    print("-" * 40)
    
    # Collect all logs
    logs = collect_logs(output_dir, data_name)
    
    # Count collected files (only actual log files, not metadata)
    collected_files = []
    for k, v in logs['files'].items():
        # Check if it's a string (log content) and not an error message
        if isinstance(v, str):
            if not v.startswith('File not found') and not v.startswith('Error reading'):
                collected_files.append(k)
    
    print(f"Collected {len(collected_files)} log files:")
    for file_name in collected_files:
        file_size = logs['metadata'].get(file_name, {}).get('size_bytes', 'unknown')
        print(f"  - {file_name} ({file_size} bytes)")
    
    # Also show which files weren't found
    missing_files = []
    for k, v in logs['files'].items():
        if isinstance(v, str) and (v.startswith('File not found') or v.startswith('Error reading')):
            missing_files.append(k)
    
    if missing_files:
        print(f"\nMissing {len(missing_files)} files:")
        for file_name in missing_files:
            print(f"  - {file_name}")
    
    print("-" * 40)
    print(f"Sending logs to webhook...")
    
    # Send to webhook
    response = send_to_webhook(webhook_url, logs)
    
    if response:
        print("=" * 40)
        print("✓ Log transmission completed successfully")
        print(f"Timestamp: {logs['timestamp']}")
        print(f"Total files processed: {len(collected_files)}")
        print(f"Total data size: {sum(logs['metadata'].get(f, {}).get('size_bytes', 0) for f in collected_files)} bytes")
        print("=" * 40)
        return True
    else:
        print("=" * 40)
        print("✗ Log transmission failed")
        print("=" * 40)
        return False

def parse_args():
    parser = argparse.ArgumentParser(
        description='Send video quality experiment logs to n8n webhook endpoint'
    )
    parser.add_argument(
        '--webhook_url',
        type=str,
        required=True,
        help='n8n webhook URL (e.g., https://n8n.marcotsh.com/webhook-test/...)'
    )
    parser.add_argument(
        '--output_dir',
        type=str,
        required=True,
        help='Output directory from the experiment (e.g., exp1/method1)'
    )
    parser.add_argument(
        '--data',
        type=str,
        required=True,
        help='Data/video name used in the experiment'
    )
    
    return parser.parse_args()

if __name__ == "__main__":
    args = parse_args()
    success = send_logs_to_webhook(args.webhook_url, args.output_dir, args.data)
    exit(0 if success else 1)