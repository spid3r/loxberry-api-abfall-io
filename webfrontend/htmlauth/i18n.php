<?php
/**
 * Lightweight i18n helper for the Waste Collection plugin.
 *
 * Resolves the active language from (in order):
 *   1. ?lang=xx URL parameter (sticky via cookie)
 *   2. previously stored cookie
 *   3. plugin.cfg [PLUGIN] LANGUAGE setting (if user pinned it)
 *   4. LoxBerry general.cfg LANG (when running on the appliance)
 *   5. Browser Accept-Language header
 *   6. Fallback "de" (German schedules as primary audience)
 *
 * Provides:
 *   AbfallioI18N::lang()                  -> active language code (e.g. "de", "en")
 *   AbfallioI18N::availableLanguages()    -> ["de", "en"] (files in templates/lang/)
 *   AbfallioI18N::all()                   -> full translation array (for JS bridge)
 *   AbfallioI18N::t($section, $key, $fallback = null)
 *   t($section, $key, $fallback)  -> shorthand
 *   te($section, $key, $fallback) -> echo+escape
 *   th($section, $key, $fallback) -> echo raw HTML (allowed for *_HELP_* keys)
 */

// No strict_types: on some LoxBerry/PHP+Apache stacks, strict t() calls would 500
// the public `index.php?view=html` path; translations are all trusted strings.
final class AbfallioI18N {
    /** @var array<string, array<string, array<string, string>>> */
    private static $cache = [];
    /** @var string */
    private static $active = "de";
    /** @var bool */
    private static $bootstrapped = false;
    /** @var string */
    private static $langDir = "";
    /** @var string */
    private static $configuredLang = "";

    public static function bootstrap(string $langDir, string $configuredLang = ""): void {
        self::$langDir = $langDir;
        self::$configuredLang = trim(strtolower($configuredLang));
        self::$active = self::resolveLanguage();
        self::$bootstrapped = true;
    }

    public static function lang(): string {
        if (!self::$bootstrapped) {
            return "de";
        }
        return self::$active;
    }

    /** @return array<int, string> */
    public static function availableLanguages(): array {
        if (!self::$langDir || !is_dir(self::$langDir)) {
            return ["de", "en"];
        }
        $out = [];
        foreach (scandir(self::$langDir) ?: [] as $entry) {
            if (preg_match('/^language_([a-z]{2})\.ini$/i', $entry, $m) === 1) {
                $out[] = strtolower($m[1]);
            }
        }
        sort($out);
        return $out ?: ["de", "en"];
    }

    /** @return array<string, array<string, string>> */
    public static function all(): array {
        return self::loadDictionary(self::lang());
    }

    public static function t(string $section, string $key, ?string $fallback = null): string {
        $dict = self::loadDictionary(self::lang());
        if (isset($dict[$section][$key])) {
            return $dict[$section][$key];
        }
        if (self::lang() !== "en") {
            $en = self::loadDictionary("en");
            if (isset($en[$section][$key])) {
                return $en[$section][$key];
            }
        }
        return $fallback ?? ($section . "." . $key);
    }

    private static function resolveLanguage(): string {
        $available = self::availableLanguages();

        $candidates = [];
        if (isset($_GET["lang"])) {
            $candidates[] = $_GET["lang"];
            // Sticky `?lang=` via cookie is disabled on the public `index.php` on some
            // LoxBerry+Apache+PHP combinations (setcookie() caused HTTP 500). Language still
            // applies for the current request via the candidate list above.
        }
        if (isset($_COOKIE["abfallio_lang"])) {
            $candidates[] = $_COOKIE["abfallio_lang"];
        }
        if (self::$configuredLang !== "") {
            $candidates[] = self::$configuredLang;
        }

        $lbhomedir = getenv("LBHOMEDIR") ?: (is_dir("/opt/loxberry") ? "/opt/loxberry" : "");
        if ($lbhomedir) {
            $generalCfg = $lbhomedir . "/system/general.cfg";
            if (is_readable($generalCfg)) {
                $cfg = @parse_ini_file($generalCfg, true);
                if (is_array($cfg) && isset($cfg["BASE"]["LANG"])) {
                    $candidates[] = $cfg["BASE"]["LANG"];
                }
            }
        }

        $accept = $_SERVER["HTTP_ACCEPT_LANGUAGE"] ?? "";
        if ($accept !== "") {
            foreach (explode(",", $accept) as $part) {
                $code = strtolower(trim(explode(";", $part)[0]));
                if ($code !== "") {
                    $candidates[] = $code;
                }
            }
        }

        foreach ($candidates as $cand) {
            $cand = strtolower(substr(trim((string) $cand), 0, 2));
            if ($cand !== "" && in_array($cand, $available, true)) {
                return $cand;
            }
        }
        // Default for this plugin: German schedules — prefer "de" when nothing matched.
        return in_array("de", $available, true)
            ? "de"
            : (in_array("en", $available, true) ? "en" : ($available[0] ?? "en"));
    }

    /** @return array<string, array<string, string>> */
    private static function loadDictionary(string $lang): array {
        if (isset(self::$cache[$lang])) {
            return self::$cache[$lang];
        }
        $file = self::$langDir . "/language_" . $lang . ".ini";
        $parsed = is_readable($file) ? @parse_ini_file($file, true) : false;
        self::$cache[$lang] = is_array($parsed) ? $parsed : [];
        return self::$cache[$lang];
    }
}

if (!function_exists("t")) {
    function t(string $section, string $key, ?string $fallback = null): string {
        return AbfallioI18N::t($section, $key, $fallback);
    }
}

if (!function_exists("te")) {
    function te(string $section, string $key, ?string $fallback = null): void {
        echo htmlspecialchars(AbfallioI18N::t($section, $key, $fallback), ENT_QUOTES, "UTF-8");
    }
}

if (!function_exists("th")) {
    function th(string $section, string $key, ?string $fallback = null): void {
        echo AbfallioI18N::t($section, $key, $fallback);
    }
}
