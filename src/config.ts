const tooltipActions = [
  { value: '', description: 'Nothing' },
  { value: 'type', description: 'Type' },
  { value: 'info', description: 'Info' },
  { value: 'infoType', description: 'Info, fallback to Type' },
  { value: 'typeInfo', description: 'Type, fallback to Info' },
  { value: 'typeAndInfo', description: 'Type and Info' },
]

export const config = {
  ghcModPath: {
    type: 'string',
    default: 'ghc-mod',
    description: 'Path to ghc-mod',
    order: 0,
  },
  enableGhcModi: {
    type: 'boolean',
    default: true,
    description: `Using GHC Modi is suggested and noticeably faster, \
but if experiencing problems, disabling it can sometimes help.`,
    order: 70,
  },
  lowMemorySystem: {
    type: 'boolean',
    default: false,
    description: `Avoid spawning more than one ghc-mod process; also disables parallel \
features, which can help with weird stack errors`,
    order: 70,
  },
  debug: {
    type: 'boolean',
    default: false,
    order: 999,
  },
  builderManagement: {
    type: 'boolean',
    description: `Experimental option to force ghc-mod into using cabal or \
stack based on ide-haskell-cabal settings; also enables an option to build \
ghc-mod when using stack`,
    default: false,
    order: 900,
  },
  additionalPathDirectories: {
    type: 'array',
    default: [],
    description: `Add this directories to PATH when invoking ghc-mod. \
You might want to add path to a directory with \
ghc, cabal, etc binaries here. \
Separate with comma.`,
    items: {
      type: 'string',
    },
    order: 0,
  },
  cabalSandbox: {
    type: 'boolean',
    default: true,
    description: 'Add cabal sandbox bin-path to PATH',
    order: 100,
  },
  stackSandbox: {
    type: 'boolean',
    default: true,
    description: 'Add stack bin-path to PATH',
    order: 100,
  },
  initTimeout: {
    type: 'integer',
    description: `How long to wait for initialization commands (checking \
GHC and ghc-mod versions, getting stack sandbox) until \
assuming those hanged and bailing. In seconds.`,
    default: 60,
    minimum: 1,
    order: 50,
  },
  interactiveInactivityTimeout: {
    type: 'integer',
    description: `Kill ghc-mod interactive process (ghc-modi) after this \
number of minutes of inactivity to conserve memory. 0 \
means never.`,
    default: 60,
    minimum: 0,
    order: 50,
  },
  interactiveActionTimeout: {
    type: 'integer',
    description: `Timeout for interactive ghc-mod commands (in seconds). 0 \
means wait forever.`,
    default: 300,
    minimum: 0,
    order: 50,
  },
  onSaveCheck: {
    type: 'boolean',
    default: true,
    description: 'Check file on save',
    order: 25,
  },
  onSaveLint: {
    type: 'boolean',
    default: true,
    description: 'Lint file on save',
    order: 25,
  },
  onChangeCheck: {
    type: 'boolean',
    default: false,
    description: 'Check file on change',
    order: 25,
  },
  onChangeLint: {
    type: 'boolean',
    default: false,
    description: 'Lint file on change',
    order: 25,
  },
  alwaysInteractiveCheck: {
    type: 'boolean',
    default: true,
    description: `Always use interactive mode for check. Much faster on large \
projects, but can lead to problems. Try disabling if experiencing slowdowns or \
crashes`,
    order: 26,
  },
  onMouseHoverShow: {
    type: 'string',
    description: 'Contents of tooltip on mouse hover',
    default: 'typeAndInfo',
    enum: tooltipActions,
    order: 30,
  },
  onSelectionShow: {
    type: 'string',
    description: 'Contents of tooltip on selection',
    default: '',
    enum: tooltipActions,
    order: 30,
  },
  maxBrowseProcesses: {
    type: 'integer',
    default: 2,
    description: `Maximum number of parallel ghc-mod browse processes, which \
are used in autocompletion backend initialization. \
Note that on larger projects it may require a considerable \
amount of memory.`,
    order: 60,
  },
  highlightTooltips: {
    type: 'boolean',
    default: true,
    description: 'Show highlighting for type/info tooltips',
    order: 40,
  },
  suppressRedundantTypeInTypeAndInfoTooltips: {
    type: 'boolean',
    default: true,
    description: `In tooltips with type AND info, suppress type if \
it's the same as info`,
    order: 41,
  },
  highlightMessages: {
    type: 'boolean',
    default: true,
    description: 'Show highlighting for output panel messages',
    order: 40,
  },
  hlintOptions: {
    type: 'array',
    default: [],
    description: 'Command line options to pass to hlint (comma-separated)',
    order: 45,
  },
  experimental: {
    type: 'boolean',
    default: false,
    description: `Enable experimental features, which are expected to land in \
next release of ghc-mod. ENABLE ONLY IF YOU KNOW WHAT YOU \
ARE DOING`,
    order: 999,
  },
  suppressGhcPackagePathWarning: {
    type: 'boolean',
    default: false,
    description: `Suppress warning about GHC_PACKAGE_PATH environment variable. \
ENABLE ONLY IF YOU KNOW WHAT YOU ARE DOING.`,
    order: 999,
  },
  ghcModMessages: {
    type: 'string',
    description:
      'How to show warnings/errors reported by ghc-mod (requires restart)',
    default: 'console',
    enum: [
      { value: 'console', description: 'Developer Console' },
      { value: 'upi', description: 'Output Panel' },
      { value: 'popup', description: 'Error/Warning Popups' },
    ],
    order: 42,
  },
  maxMemMegs: {
    type: 'integer',
    descrition: 'Maximum ghc-mod interactive mode memory usage (in megabytes)',
    default: 4 * 1024,
    minimum: 1024,
    order: 50,
  },
}
