import os
from datetime import datetime


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
