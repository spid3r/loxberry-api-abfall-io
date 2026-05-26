/**
 * LoxBerry plugin cron install helpers (merged file under system/cron/cron.d/<FOLDER>).
 */

export const CRON_SCHEDULE = "17 * * * *";
export const CRON_USER = "loxberry";
export const CRON_FETCH_WRAPPER = "run_fetch.sh";

export interface MergedCronInstallProbe {
  merged_cron_path: string;
  file_exists: boolean;
  /** True when unexpanded `REPLACELB*` tokens remain in the merged cron file. */
  replacelb_placeholder_found: boolean;
  /** Cron invokes the resilient shell wrapper instead of a hard-coded node binary. */
  uses_fetch_wrapper: boolean;
  /** Cron line calls `fetch.cjs` via an absolute `…/node …/fetch.cjs` path. */
  hardcoded_node_invocation: boolean;
  /**
   * Heuristic: legacy cron that hard-codes a node binary (typical `/usr/bin/node`) without
   * the wrapper — likely broken on appliances where Node lives elsewhere.
   */
  node_path_likely_broken: boolean;
}

/** Analyse merged cron file contents (pure function — easy to unit test). */
export function analyzeMergedCronContent(text: string): Omit<MergedCronInstallProbe, "merged_cron_path" | "file_exists"> {
  const replacelb_placeholder_found = text.includes("REPLACELB");
  const uses_fetch_wrapper = /\brun_fetch\.sh\b/.test(text);
  const invokesFetchDirectly = /\bfetch\.cjs\b/.test(text);
  const hardcoded_node_invocation =
    !uses_fetch_wrapper &&
    invokesFetchDirectly &&
    (/\/[^\s]+\/node\s+[^\s]*fetch\.cjs/.test(text) || /\bnode\s+[^\s]*fetch\.cjs/.test(text));
  const node_path_likely_broken =
    !uses_fetch_wrapper && (hardcoded_node_invocation || replacelb_placeholder_found || invokesFetchDirectly);
  return {
    replacelb_placeholder_found,
    uses_fetch_wrapper,
    hardcoded_node_invocation,
    node_path_likely_broken,
  };
}

/** Build the canonical hourly cron line (placeholders for LoxBerry install merge). */
export function buildPluginCronLine(options: {
  lbhomedir: string;
  pluginFolder: string;
  logDir: string;
  usePlaceholders?: boolean;
}): string {
  const home = options.usePlaceholders ? "REPLACELBPHOMEDIR" : options.lbhomedir;
  const folder = options.usePlaceholders ? "REPLACELBPPLUGINDIR" : options.pluginFolder;
  const logDir = options.usePlaceholders ? "REPLACELBPLOGDIR" : options.logDir;
  const wrapper = `${home}/bin/plugins/${folder}/${CRON_FETCH_WRAPPER}`;
  return (
    `${CRON_SCHEDULE} ${CRON_USER} ` +
    `LBHOMEDIR=${home} LBPPLUGINDIR=${folder} ${wrapper} >> ${logDir}/abfall.log 2>&1`
  );
}

/** Whether postroot should rewrite the merged cron to the canonical wrapper form. */
export function mergedCronNeedsPatch(text: string): boolean {
  const a = analyzeMergedCronContent(text);
  if (a.replacelb_placeholder_found) return true;
  if (a.hardcoded_node_invocation) return true;
  if (/\bfetch\.cjs\b/.test(text) && !a.uses_fetch_wrapper) return true;
  return false;
}
