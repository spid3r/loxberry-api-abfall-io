<?php
/**
 * Waste Collection - Loxone Miniserver Endpoint
 *
 * Returns waste collection dates in a flat text format that can be parsed
 * by the Loxone Virtual HTTP Input pattern engine.
 *
 * Endpunkte:
 *   GET /plugins/abfallio/loxone.php              -> Flat-Text aller Kategorien
 *   GET /plugins/abfallio/loxone.php?cat=Restabfall -> Days until next pickup for one category
 *   GET /plugins/abfallio/loxone.php?format=list   -> List of normalized category names
 */

require_once __DIR__ . '/waste_data_paths.php';

$debug = isset($_GET['debug']);
[$cache_file, $tried_paths] = abfallio_find_abfall_data_json();

$lbhomedir = getenv('LBHOMEDIR') ?: (is_dir('/opt/loxberry') ? '/opt/loxberry' : '');
$lbpdata = getenv('LBPDATA');
$lbpplugindir = getenv('LBPPLUGINDIR') ?: basename(__DIR__);

header('Access-Control-Allow-Origin: *');
header('Cache-Control: public, max-age=300');

if ($debug) {
    header('Content-Type: text/plain; charset=utf-8');
    echo "=== Waste Collection - loxone.php Debug ===\n\n";
    echo "__DIR__:        " . __DIR__ . "\n";
    echo "LBHOMEDIR:      " . ($lbhomedir ?: '(not set)') . "\n";
    echo "LBPDATA:        " . ($lbpdata ?: '(not set)') . "\n";
    echo "LBPPLUGINDIR:   " . ($lbpplugindir ?: '(not set)') . "\n";
    echo "basename(__DIR__): " . basename(__DIR__) . "\n\n";
    echo "--- Tried paths ---\n";
    foreach ($tried_paths as $tp) {
        echo ($tp['exists'] ? '[OK]  ' : '[MISS]') . ' ' . $tp['label'] . "\n";
        echo "       " . $tp['path'] . "\n";
    }
    echo "\ncache_file: " . ($cache_file ?: '(none found)') . "\n";
    if ($cache_file) {
        $size = filesize($cache_file);
        echo "file size:  " . $size . " bytes\n";
        if ($size < 10) {
            echo "content:    " . file_get_contents($cache_file) . "\n";
        }
    }
    exit;
}

if (!$cache_file) {
    header('Content-Type: text/plain; charset=utf-8');
    echo "ERROR: No data available\n";
    exit;
}

$data = json_decode(file_get_contents($cache_file), true);
if (!$data || empty($data['termine'])) {
    header('Content-Type: text/plain; charset=utf-8');
    echo "ERROR: No collection entries available\n";
    exit;
}

$termine = $data['termine'];

/**
 * Normalize category name for Loxone pattern matching:
 * - Replace umlauts (ae, oe, ue, ss)
 * - Replace spaces with underscores
 * - Strip remaining non-alphanumeric chars (except underscore/hyphen)
 */
function normalize_name($name) {
    $map = [
        'ä' => 'ae', 'ö' => 'oe', 'ü' => 'ue', 'ß' => 'ss',
        'Ä' => 'Ae', 'Ö' => 'Oe', 'Ü' => 'Ue',
    ];
    $name = strtr($name, $map);
    $name = preg_replace('/\s+/', '_', $name);
    $name = preg_replace('/[^a-zA-Z0-9_-]/', '', $name);
    return $name;
}

$format = $_GET['format'] ?? '';
$cat = $_GET['cat'] ?? '';

// --- Format: list ---
if ($format === 'list') {
    header('Content-Type: text/plain; charset=utf-8');
    $names = [];
    foreach ($termine as $name => $info) {
        $names[] = normalize_name($name);
    }
    echo "Categories: " . implode(', ', $names) . "\n";
    exit;
}

// --- Single category ---
if ($cat !== '') {
    header('Content-Type: text/plain; charset=utf-8');

    // Try exact match first, then normalized match
    if (isset($termine[$cat])) {
        echo $termine[$cat]['tage'] . "\n";
        exit;
    }
    $cat_norm = normalize_name($cat);
    foreach ($termine as $name => $info) {
        if (normalize_name($name) === $cat_norm || stripos(normalize_name($name), $cat_norm) === 0) {
            echo $info['tage'] . "\n";
            exit;
        }
    }
    echo "-1\n";
    exit;
}

// --- Default: flat text for all categories ---
header('Content-Type: text/plain; charset=utf-8');

foreach ($termine as $name => $info) {
    $key = normalize_name($name);
    echo $key . "_Days: " . $info['tage'] . "\n";
    echo $key . "_Date: " . $info['datum'] . "\n";
    echo $key . "_Weekday: " . $info['wochentag'] . "\n";
    $wdn = isset($info['wochentag_num']) ? (int) $info['wochentag_num'] : 0;
    echo $key . "_WeekdayNum: " . $wdn . "\n";
}
