/**
 * The names the mod is known by: its plugin name, the element keys its band
 * draws, and the texts it prints.
 */
export const PLUGIN_NAME = 'sdlc-workflow'

/** The filter `Input` in the band's title row; `e.element` at `ui.input`. */
export const FILTER_KEY = 'wf-filter'
/** The `Button` that closes the band; `e.element` at `ui.press`. */
export const CLOSE_KEY = 'wf-close'
/** The `Button` that returns to the step before; `e.element` at `ui.press`. */
export const BACK_KEY = 'wf-back'

/** The names the bare dispatcher command may resolve to at `command.run`. */
export const DISPATCHER_COMMANDS = ['wf', `${PLUGIN_NAME}:wf`] as const

/** One row at 80 columns: a longer hint wraps, and a wrapped band arms no digit. */
export const HINT_TEXT = 'digit picks · 0 or wheel pages · ctrl+x tab: type filters, digit+Enter picks, Tab moves, Esc leaves'
export const NO_MATCH_TEXT = '(nothing matches the filter)'
export const NOTHING_TEXT = '(nothing to pick)'
export const MORE_KEY = 'wf-more'
export const OPTION_KEY_PREFIX = 'wf-opt:'
export const NO_ROOT_TEXT = 'No .ai/workflows directory at or above the working directory; type the command in full.'
export const NO_WORKFLOWS_TEXT = 'No workflows under .ai/workflows yet; start one with /wf intake <description>.'
export const CLOSED_TEXT = 'Picker closed.'
export const OPENED_TEXT = 'Pick from the list above the prompt.'
export const RUN_TEXT = 'Press Enter to run'
export const FILL_REFUSED_TEXT = 'The prompt box is not free; type the command in full: '
export const DASHBOARD_TERMINAL_TEXT = 'The workflows dashboard draws in the terminal only; this session draws elsewhere.'

export function registerFailedTextOf(command: string, reason: string): string {
  return `sdlc-workflow: could not register /${command}: ${reason}`
}
