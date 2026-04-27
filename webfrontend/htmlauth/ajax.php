<?php
/**
 * Waste Collection - AJAX Backend
 * Routes requests to the Node.js CLI (abfall_api.cjs) and returns JSON.
 */

header('Content-Type: application/json; charset=utf-8');

$lbhomedir = getenv('LBHOMEDIR') ?: (is_dir('/opt/loxberry') ? '/opt/loxberry' : '');
$lbpplugindir = getenv('LBPPLUGINDIR') ?: basename(__DIR__);

if ($lbhomedir && is_dir($lbhomedir . '/bin/plugins/' . $lbpplugindir)) {
    $plugin_bin = $lbhomedir . '/bin/plugins/' . $lbpplugindir;
    $plugin_config = $lbhomedir . '/config/plugins/' . $lbpplugindir;
    $plugin_data = $lbhomedir . '/data/plugins/' . $lbpplugindir;
} else {
    $plugin_bin = dirname(dirname(__DIR__)) . '/bin';
    $plugin_config = dirname(dirname(__DIR__)) . '/config';
    $plugin_data = dirname(dirname(__DIR__)) . '/data';
}

function find_node() {
    foreach (['/usr/bin/node', '/usr/local/bin/node', '/opt/loxberry/bin/node'] as $candidate) {
        if (is_executable($candidate)) {
            return $candidate;
        }
    }
    $which = trim((string) @shell_exec('command -v node 2>/dev/null'));
    if ($which !== '' && is_executable($which)) {
        return $which;
    }
    return 'node';
}

$node = find_node();

$api_script = $plugin_bin . '/abfall_api.cjs';

/** UTF-8 string length (not byte length) for query limits — avoids edge cases on multibyte characters. */
function abfallio_utf8_len($s) {
    if (function_exists('mb_strlen')) {
        return mb_strlen((string) $s, 'UTF-8');
    }
    return strlen((string) $s);
}

/**
 * Pass a UTF-8 string to Node on the command line. PHP's escapeshellarg() often
 * mangles or strips non-ASCII (Umlauts, etc.); the payload is base64 and decodes
 * in abfall_api.cjs when prefixed with b64: (ASCII-only on the real argv).
 */
function abfallio_arg_b64_utf8($s) {
    return 'b64:' . base64_encode((string) $s);
}

$action = $_GET['action'] ?? $_POST['action'] ?? '';

function run_api($node, $script, $args, $expect_json = true) {
    global $lbhomedir, $lbpplugindir;
    if (!file_exists($script)) {
        return json_encode(['error' => 'Script not found: ' . $script]);
    }
    $env_prefix = '';
    if ($lbhomedir) {
        $env_prefix .= 'LBHOMEDIR=' . escapeshellarg($lbhomedir) . ' ';
    }
    if ($lbpplugindir) {
        $env_prefix .= 'LBPPLUGINDIR=' . escapeshellarg($lbpplugindir) . ' ';
    }
    $cmd = $env_prefix . escapeshellcmd($node) . ' ' . escapeshellarg($script);
    foreach ($args as $arg) {
        $cmd .= ' ' . escapeshellarg($arg);
    }
    $stderr_file = tempnam(sys_get_temp_dir(), 'abfallio_err_');
    $cmd_full = $cmd . ' 2>' . escapeshellarg($stderr_file);
    $output = shell_exec($cmd_full);
    $stderr = is_file($stderr_file) ? @file_get_contents($stderr_file) : '';
    if (is_file($stderr_file)) {
        @unlink($stderr_file);
    }
    if ($output === null) {
        $detail = trim((string) $stderr);
        $msg = 'Command execution failed';
        if ($detail !== '') {
            $msg .= ': ' . substr($detail, 0, 500);
        } else {
            $msg .= ' (node="' . $node . '", script="' . $script . '")';
        }
        return $expect_json ? json_encode(['error' => $msg]) : $detail;
    }
    if ($expect_json) {
        $trimmed = trim($output);
        if ($trimmed === '') {
            $detail = trim((string) $stderr);
            $msg = $detail !== ''
                ? 'Empty stdout, stderr: ' . substr($detail, 0, 500)
                : 'Empty response from script';
            return json_encode(['error' => $msg]);
        }
        $json_test = json_decode($trimmed);
        if ($json_test === null && json_last_error() !== JSON_ERROR_NONE) {
            return json_encode(['error' => $trimmed]);
        }
        return $trimmed;
    }
    return $output;
}

function json_response($data) {
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

switch ($action) {

    case 'search_street':
        $q = $_GET['q'] ?? '';
        if (abfallio_utf8_len($q) < 3) {
            json_response(['error' => 'Query too short']);
        }
        $output = run_api($node, $api_script, ['search_street', abfallio_arg_b64_utf8($q)]);
        echo $output ?: json_encode([]);
        break;

    case 'search_service':
        $q = $_GET['q'] ?? '';
        if (abfallio_utf8_len($q) < 2) {
            json_response(['error' => 'Query too short']);
        }
        $output = run_api($node, $api_script, ['search_service', abfallio_arg_b64_utf8($q)]);
        echo $output ?: json_encode([]);
        break;

    case 'refresh_service_map':
        $u = $_GET['url'] ?? '';
        $args = ['refresh_service_map'];
        if (trim($u) !== '') {
            $args[] = $u;
        }
        $output = run_api($node, $api_script, $args);
        echo $output ?: json_encode(['error' => 'No response from refresh_service_map']);
        break;

    case 'search_hnr':
        $street_id = $_GET['street_id'] ?? '';
        if (!$street_id) {
            json_response(['error' => 'Missing street_id']);
        }
        $output = run_api($node, $api_script, ['search_hnr', $street_id]);
        echo $output ?: json_encode([]);
        break;

    case 'register':
        $output = run_api($node, $api_script, ['register']);
        echo $output ?: json_encode(['error' => 'Registration failed']);
        break;

    case 'fetch_now':
        $output = run_api($node, $api_script, ['fetch']);
        echo $output ?: json_encode(['error' => 'Fetch failed']);
        break;

    case 'status':
        $output = run_api($node, $api_script, ['status']);
        echo $output ?: json_encode(['error' => 'Status unavailable']);
        break;

    case 'log':
        $output = run_api($node, $api_script, ['log', '200'], false);
        json_response(['log' => $output ?: '']);
        break;

    case 'clear_log':
        run_api($node, $api_script, ['clear_log'], false);
        json_response(['success' => true]);
        break;

    case 'save_location':
        $config_file = $plugin_config . '/abfall.json';
        $config = file_exists($config_file) ? json_decode(file_get_contents($config_file), true) : [];
        $config['location'] = $config['location'] ?? [];
        $config['location']['f_id_kommune'] = $_POST['kommune_id'] ?? '';
        $config['location']['f_id_strasse'] = $_POST['street_id'] ?? '';
        $config['location']['street_name'] = $_POST['street_name'] ?? '';
        $config['location']['f_id_strasse_hnr'] = $_POST['hnr_id'] ?? '';
        $config['location']['hnr_name'] = $_POST['hnr_name'] ?? '';
        file_put_contents($config_file, json_encode($config, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        json_response(['success' => true]);
        break;

    case 'reset_location':
        $config_file = $plugin_config . '/abfall.json';
        $config = file_exists($config_file) ? (json_decode(file_get_contents($config_file), true) ?: []) : [];
        $config['location'] = [];
        file_put_contents($config_file, json_encode($config, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        json_response(['success' => true]);
        break;

    case 'save_settings':
        $config_file = $plugin_config . '/abfall.json';
        $config = file_exists($config_file) ? (json_decode(file_get_contents($config_file), true) ?: []) : [];
        $sk = trim((string) ($_POST['service_key'] ?? ''));
        if ($sk !== '' && !preg_match('/^[a-fA-F0-9]{32}$/', $sk)) {
            json_response(['success' => false, 'error' => 'Invalid service key', 'code' => 'service_key']);
        }
        $config['service_key'] = $sk === '' ? '' : strtolower($sk);
        if ($sk === '') {
            $config['location'] = [];
        }
        $config['fetch_interval_hours'] = max(6, min(168, intval($_POST['fetch_interval_hours'] ?? 6)));
        $config['fetch_fuzz_minutes'] = max(0, min(360, intval($_POST['fetch_fuzz_minutes'] ?? 30)));
        $filter_raw = $_POST['categories_filter'] ?? '[]';
        $config['categories_filter'] = json_decode($filter_raw, true) ?: [];

        $config['mqtt'] = $config['mqtt'] ?? [];
        $config['mqtt']['enabled'] = !empty($_POST['mqtt_enabled']) && $_POST['mqtt_enabled'] !== '0';
        $config['mqtt']['use_loxberry_broker'] = !empty($_POST['mqtt_use_loxberry_broker']) && $_POST['mqtt_use_loxberry_broker'] !== '0';
        $config['mqtt']['host'] = trim((string) ($_POST['mqtt_host'] ?? ''));
        $port = intval($_POST['mqtt_port'] ?? 1883);
        $config['mqtt']['port'] = ($port >= 1 && $port <= 65535) ? $port : 1883;
        $config['mqtt']['user'] = (string) ($_POST['mqtt_user'] ?? '');
        $config['mqtt']['password'] = (string) ($_POST['mqtt_password'] ?? '');
        $topic = trim((string) ($_POST['mqtt_topic_prefix'] ?? ''));
        $config['mqtt']['topic_prefix'] = $topic !== '' ? $topic : 'loxberry/abfallio';
        $config['mqtt']['retain'] = !empty($_POST['mqtt_retain']) && $_POST['mqtt_retain'] !== '0';

        file_put_contents($config_file, json_encode($config, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        json_response(['success' => true]);
        break;

    case 'save_credentials':
        json_response(['success' => true, 'info' => 'Credentials not needed with api.abfall.io']);
        break;

    case 'download_json':
        $cache_file = $plugin_data . '/abfall_data.json';
        if (file_exists($cache_file)) {
            header('Content-Disposition: attachment; filename=abfall_data.json');
            readfile($cache_file);
        } else {
            json_response(['error' => 'No data file found']);
        }
        break;

    default:
        json_response(['error' => 'Unknown action: ' . $action]);
}
