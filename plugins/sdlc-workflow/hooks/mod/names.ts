/**
 * The names the mod is known by: its plugin name, the element keys its band
 * draws, and the texts it prints.
 */
export const PLUGIN_NAME = 'sdlc-workflow'

/** The `Select` the band draws; `e.element` at `ui.select`. */
export const PICK_KEY = 'wf-pick'
/** The `Button` that closes the band; `e.element` at `ui.press`. */
export const CLOSE_KEY = 'wf-close'

/** The names the bare dispatcher command may resolve to at `command.run`. */
export const DISPATCHER_COMMANDS = ['wf', `${PLUGIN_NAME}:wf`] as const

export const HINT_TEXT = 'Enter picks · Esc returns to the prompt · the pick fills the prompt, you press Enter to run it'
export const NO_ROOT_TEXT = 'No .ai/workflows directory at or above the working directory; type the command in full.'
export const NO_WORKFLOWS_TEXT = 'No workflows under .ai/workflows yet; start one with /wf intake <description>.'
export const CLOSED_TEXT = 'Picker closed.'
export const OPENED_TEXT = 'Pick from the list above the prompt.'
export const RUN_TEXT = 'Press Enter to run'
export const FILL_REFUSED_TEXT = 'The prompt box is not free; type the command in full: '

export function registerFailedTextOf(command: string, reason: string): string {
  return `sdlc-workflow: could not register /${command}: ${reason}`
}
