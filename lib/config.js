"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tooltipActions = [
    { value: '', description: 'Nothing' },
    { value: 'type', description: 'Type' },
    { value: 'info', description: 'Info' },
    { value: 'infoType', description: 'Info, fallback to Type' },
    { value: 'typeInfo', description: 'Type, fallback to Info' },
    { value: 'typeAndInfo', description: 'Type and Info' }
];
exports.config = {
    ghcModPath: {
        type: 'string',
        default: 'ghc-mod',
        description: 'Path to ghc-mod',
        order: 0
    },
    enableGhcModi: {
        type: 'boolean',
        default: true,
        description: `Using GHC Modi is suggested and noticeably faster, \
but if experiencing problems, disabling it can sometimes help.`,
        order: 70
    },
    lowMemorySystem: {
        type: 'boolean',
        default: false,
        description: `Avoid spawning more than one ghc-mod process; also disables parallel \
features, which can help with weird stack errors`,
        order: 70
    },
    debug: {
        type: 'boolean',
        default: false,
        order: 999
    },
    additionalPathDirectories: {
        type: 'array',
        default: [],
        description: `Add this directories to PATH when invoking ghc-mod. \
You might want to add path to a directory with \
ghc, cabal, etc binaries here. \
Separate with comma.`,
        items: {
            type: 'string'
        },
        order: 0
    },
    cabalSandbox: {
        type: 'boolean',
        default: true,
        description: 'Add cabal sandbox bin-path to PATH',
        order: 100
    },
    stackSandbox: {
        type: 'boolean',
        default: true,
        description: 'Add stack bin-path to PATH',
        order: 100
    },
    initTimeout: {
        type: 'integer',
        description: `How long to wait for initialization commands (checking \
GHC and ghc-mod versions, getting stack sandbox) until \
assuming those hanged and bailing. In seconds.`,
        default: 60,
        minimum: 1,
        order: 50
    },
    interactiveInactivityTimeout: {
        type: 'integer',
        description: `Kill ghc-mod interactive process (ghc-modi) after this \
number of minutes of inactivity to conserve memory. 0 \
means never.`,
        default: 60,
        minimum: 0,
        order: 50
    },
    interactiveActionTimeout: {
        type: 'integer',
        description: `Timeout for interactive ghc-mod commands (in seconds). 0 \
means wait forever.`,
        default: 300,
        minimum: 0,
        order: 50
    },
    onSaveCheck: {
        type: 'boolean',
        default: true,
        description: 'Check file on save',
        order: 25
    },
    onSaveLint: {
        type: 'boolean',
        default: true,
        description: 'Lint file on save',
        order: 25
    },
    onChangeCheck: {
        type: 'boolean',
        default: false,
        description: 'Check file on change',
        order: 25
    },
    onChangeLint: {
        type: 'boolean',
        default: false,
        description: 'Lint file on change',
        order: 25
    },
    onMouseHoverShow: {
        type: 'string',
        description: 'Contents of tooltip on mouse hover',
        default: 'typeAndInfo',
        enum: tooltipActions,
        order: 30
    },
    onSelectionShow: {
        type: 'string',
        description: 'Contents of tooltip on selection',
        default: '',
        enum: tooltipActions,
        order: 30
    },
    maxBrowseProcesses: {
        type: 'integer',
        default: 2,
        description: `Maximum number of parallel ghc-mod browse processes, which \
are used in autocompletion backend initialization. \
Note that on larger projects it may require a considerable \
amount of memory.`,
        order: 60
    },
    highlightTooltips: {
        type: 'boolean',
        default: true,
        description: 'Show highlighting for type/info tooltips',
        order: 40
    },
    highlightMessages: {
        type: 'boolean',
        default: true,
        description: 'Show highlighting for output panel messages',
        order: 40
    },
    hlintOptions: {
        type: 'array',
        default: [],
        description: 'Command line options to pass to hlint (comma-separated)',
        order: 45
    },
    experimental: {
        type: 'boolean',
        default: false,
        description: `Enable experimental features, which are expected to land in \
next release of ghc-mod. ENABLE ONLY IF YOU KNOW WHAT YOU \
ARE DOING`,
        order: 999
    },
    suppressGhcPackagePathWarning: {
        type: 'boolean',
        default: false,
        description: `Suppress warning about GHC_PACKAGE_PATH environment variable. \
ENABLE ONLY IF YOU KNOW WHAT YOU ARE DOING.`,
        order: 999
    },
    ghcModMessages: {
        type: 'string',
        description: 'How to show warnings/errors reported by ghc-mod (requires restart)',
        default: 'console',
        enum: [
            { value: 'console', description: 'Developer Console' },
            { value: 'upi', description: 'Output Panel' },
            { value: 'popup', description: 'Error/Warning Popups' },
        ],
        order: 42
    }
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlnLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2NvbmZpZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLE1BQU0sY0FBYyxHQUNsQjtJQUNFLEVBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxXQUFXLEVBQUUsU0FBUyxFQUFDO0lBQ25DLEVBQUMsS0FBSyxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFDO0lBQ3BDLEVBQUMsS0FBSyxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFDO0lBQ3BDLEVBQUMsS0FBSyxFQUFFLFVBQVUsRUFBRSxXQUFXLEVBQUUsd0JBQXdCLEVBQUM7SUFDMUQsRUFBQyxLQUFLLEVBQUUsVUFBVSxFQUFFLFdBQVcsRUFBRSx3QkFBd0IsRUFBQztJQUMxRCxFQUFDLEtBQUssRUFBRSxhQUFhLEVBQUUsV0FBVyxFQUFFLGVBQWUsRUFBQztDQUNyRCxDQUFBO0FBRVUsUUFBQSxNQUFNLEdBQUc7SUFDcEIsVUFBVSxFQUFFO1FBQ1YsSUFBSSxFQUFFLFFBQVE7UUFDZCxPQUFPLEVBQUUsU0FBUztRQUNsQixXQUFXLEVBQUUsaUJBQWlCO1FBQzlCLEtBQUssRUFBRSxDQUFDO0tBQ1Q7SUFDRCxhQUFhLEVBQUU7UUFDYixJQUFJLEVBQUUsU0FBUztRQUNmLE9BQU8sRUFBRSxJQUFJO1FBQ2IsV0FBVyxFQUNUOytEQUN5RDtRQUMzRCxLQUFLLEVBQUUsRUFBRTtLQUNWO0lBQ0QsZUFBZSxFQUFFO1FBQ2YsSUFBSSxFQUFFLFNBQVM7UUFDZixPQUFPLEVBQUUsS0FBSztRQUNkLFdBQVcsRUFDVDtpREFDMkM7UUFDN0MsS0FBSyxFQUFFLEVBQUU7S0FDVjtJQUNELEtBQUssRUFBRTtRQUNMLElBQUksRUFBRSxTQUFTO1FBQ2YsT0FBTyxFQUFFLEtBQUs7UUFDZCxLQUFLLEVBQUUsR0FBRztLQUNYO0lBQ0QseUJBQXlCLEVBQUU7UUFDekIsSUFBSSxFQUFFLE9BQU87UUFDYixP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UztRQUNmLE9BQU8sRUFBRSxLQUFLO1FBQ2QsV0FBVyxFQUFFOztVQUVQO1FBQ04sS0FBSyxFQUFFLEdBQUc7S0FDWDtJQUNELDZCQUE2QixFQUFFO1FBQzdCLElBQUksRUFBRSxTQUFTO1FBQ2YsT0FBTyxFQUFFLEtBQUs7UUFDZCxXQUFXLEVBQUU7NENBQzJCO1FBQ3hDLEtBQUssRUFBRSxHQUFHO0tBQ1g7SUFDRCxjQUFjLEVBQUU7UUFDZCxJQUFJLEVBQUUsUUFBUTtRQUNkLFdBQVcsRUFBRSxvRUFBb0U7UUFDakYsT0FBTyxFQUFFLFNBQVM7UUFDbEIsSUFBSSxFQUFFO1lBQ0osRUFBQyxLQUFLLEVBQUUsU0FBUyxFQUFFLFdBQVcsRUFBRSxtQkFBbUIsRUFBQztZQUNwRCxFQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsV0FBVyxFQUFFLGNBQWMsRUFBQztZQUMzQyxFQUFDLEtBQUssRUFBRSxPQUFPLEVBQUUsV0FBVyxFQUFFLHNCQUFzQixFQUFDO1NBQ3REO1FBQ0QsS0FBSyxFQUFFLEVBQUU7S0FDVjtDQUNGLENBQUEiLCJzb3VyY2VzQ29udGVudCI6WyJjb25zdCB0b29sdGlwQWN0aW9ucyA9XG4gIFtcbiAgICB7dmFsdWU6ICcnLCBkZXNjcmlwdGlvbjogJ05vdGhpbmcnfSxcbiAgICB7dmFsdWU6ICd0eXBlJywgZGVzY3JpcHRpb246ICdUeXBlJ30sXG4gICAge3ZhbHVlOiAnaW5mbycsIGRlc2NyaXB0aW9uOiAnSW5mbyd9LFxuICAgIHt2YWx1ZTogJ2luZm9UeXBlJywgZGVzY3JpcHRpb246ICdJbmZvLCBmYWxsYmFjayB0byBUeXBlJ30sXG4gICAge3ZhbHVlOiAndHlwZUluZm8nLCBkZXNjcmlwdGlvbjogJ1R5cGUsIGZhbGxiYWNrIHRvIEluZm8nfSxcbiAgICB7dmFsdWU6ICd0eXBlQW5kSW5mbycsIGRlc2NyaXB0aW9uOiAnVHlwZSBhbmQgSW5mbyd9XG4gIF1cblxuZXhwb3J0IGNvbnN0IGNvbmZpZyA9IHtcbiAgZ2hjTW9kUGF0aDoge1xuICAgIHR5cGU6ICdzdHJpbmcnLFxuICAgIGRlZmF1bHQ6ICdnaGMtbW9kJyxcbiAgICBkZXNjcmlwdGlvbjogJ1BhdGggdG8gZ2hjLW1vZCcsXG4gICAgb3JkZXI6IDBcbiAgfSxcbiAgZW5hYmxlR2hjTW9kaToge1xuICAgIHR5cGU6ICdib29sZWFuJyxcbiAgICBkZWZhdWx0OiB0cnVlLFxuICAgIGRlc2NyaXB0aW9uOlxuICAgICAgYFVzaW5nIEdIQyBNb2RpIGlzIHN1Z2dlc3RlZCBhbmQgbm90aWNlYWJseSBmYXN0ZXIsIFxcXG5idXQgaWYgZXhwZXJpZW5jaW5nIHByb2JsZW1zLCBkaXNhYmxpbmcgaXQgY2FuIHNvbWV0aW1lcyBoZWxwLmAsXG4gICAgb3JkZXI6IDcwXG4gIH0sXG4gIGxvd01lbW9yeVN5c3RlbToge1xuICAgIHR5cGU6ICdib29sZWFuJyxcbiAgICBkZWZhdWx0OiBmYWxzZSxcbiAgICBkZXNjcmlwdGlvbjpcbiAgICAgIGBBdm9pZCBzcGF3bmluZyBtb3JlIHRoYW4gb25lIGdoYy1tb2QgcHJvY2VzczsgYWxzbyBkaXNhYmxlcyBwYXJhbGxlbCBcXFxuZmVhdHVyZXMsIHdoaWNoIGNhbiBoZWxwIHdpdGggd2VpcmQgc3RhY2sgZXJyb3JzYCxcbiAgICBvcmRlcjogNzBcbiAgfSxcbiAgZGVidWc6IHtcbiAgICB0eXBlOiAnYm9vbGVhbicsXG4gICAgZGVmYXVsdDogZmFsc2UsXG4gICAgb3JkZXI6IDk5OVxuICB9LFxuICBhZGRpdGlvbmFsUGF0aERpcmVjdG9yaWVzOiB7XG4gICAgdHlwZTogJ2FycmF5JyxcbiAgICBkZWZhdWx0OiBbXSxcbiAgICBkZXNjcmlwdGlvbjogYEFkZCB0aGlzIGRpcmVjdG9yaWVzIHRvIFBBVEggd2hlbiBpbnZva2luZyBnaGMtbW9kLiBcXFxuWW91IG1pZ2h0IHdhbnQgdG8gYWRkIHBhdGggdG8gYSBkaXJlY3Rvcnkgd2l0aCBcXFxuZ2hjLCBjYWJhbCwgZXRjIGJpbmFyaWVzIGhlcmUuIFxcXG5TZXBhcmF0ZSB3aXRoIGNvbW1hLmAsXG4gICAgaXRlbXM6IHtcbiAgICAgIHR5cGU6ICdzdHJpbmcnXG4gICAgfSxcbiAgICBvcmRlcjogMFxuICB9LFxuICBjYWJhbFNhbmRib3g6IHtcbiAgICB0eXBlOiAnYm9vbGVhbicsXG4gICAgZGVmYXVsdDogdHJ1ZSxcbiAgICBkZXNjcmlwdGlvbjogJ0FkZCBjYWJhbCBzYW5kYm94IGJpbi1wYXRoIHRvIFBBVEgnLFxuICAgIG9yZGVyOiAxMDBcbiAgfSxcbiAgc3RhY2tTYW5kYm94OiB7XG4gICAgdHlwZTogJ2Jvb2xlYW4nLFxuICAgIGRlZmF1bHQ6IHRydWUsXG4gICAgZGVzY3JpcHRpb246ICdBZGQgc3RhY2sgYmluLXBhdGggdG8gUEFUSCcsXG4gICAgb3JkZXI6IDEwMFxuICB9LFxuICBpbml0VGltZW91dDoge1xuICAgIHR5cGU6ICdpbnRlZ2VyJyxcbiAgICBkZXNjcmlwdGlvbjogYEhvdyBsb25nIHRvIHdhaXQgZm9yIGluaXRpYWxpemF0aW9uIGNvbW1hbmRzIChjaGVja2luZyBcXFxuR0hDIGFuZCBnaGMtbW9kIHZlcnNpb25zLCBnZXR0aW5nIHN0YWNrIHNhbmRib3gpIHVudGlsIFxcXG5hc3N1bWluZyB0aG9zZSBoYW5nZWQgYW5kIGJhaWxpbmcuIEluIHNlY29uZHMuYCxcbiAgICBkZWZhdWx0OiA2MCxcbiAgICBtaW5pbXVtOiAxLFxuICAgIG9yZGVyOiA1MFxuICB9LFxuICBpbnRlcmFjdGl2ZUluYWN0aXZpdHlUaW1lb3V0OiB7XG4gICAgdHlwZTogJ2ludGVnZXInLFxuICAgIGRlc2NyaXB0aW9uOiBgS2lsbCBnaGMtbW9kIGludGVyYWN0aXZlIHByb2Nlc3MgKGdoYy1tb2RpKSBhZnRlciB0aGlzIFxcXG5udW1iZXIgb2YgbWludXRlcyBvZiBpbmFjdGl2aXR5IHRvIGNvbnNlcnZlIG1lbW9yeS4gMCBcXFxubWVhbnMgbmV2ZXIuYCxcbiAgICBkZWZhdWx0OiA2MCxcbiAgICBtaW5pbXVtOiAwLFxuICAgIG9yZGVyOiA1MFxuICB9LFxuICBpbnRlcmFjdGl2ZUFjdGlvblRpbWVvdXQ6IHtcbiAgICB0eXBlOiAnaW50ZWdlcicsXG4gICAgZGVzY3JpcHRpb246IGBUaW1lb3V0IGZvciBpbnRlcmFjdGl2ZSBnaGMtbW9kIGNvbW1hbmRzIChpbiBzZWNvbmRzKS4gMCBcXFxubWVhbnMgd2FpdCBmb3JldmVyLmAsXG4gICAgZGVmYXVsdDogMzAwLFxuICAgIG1pbmltdW06IDAsXG4gICAgb3JkZXI6IDUwXG4gIH0sXG4gIG9uU2F2ZUNoZWNrOiB7XG4gICAgdHlwZTogJ2Jvb2xlYW4nLFxuICAgIGRlZmF1bHQ6IHRydWUsXG4gICAgZGVzY3JpcHRpb246ICdDaGVjayBmaWxlIG9uIHNhdmUnLFxuICAgIG9yZGVyOiAyNVxuICB9LFxuICBvblNhdmVMaW50OiB7XG4gICAgdHlwZTogJ2Jvb2xlYW4nLFxuICAgIGRlZmF1bHQ6IHRydWUsXG4gICAgZGVzY3JpcHRpb246ICdMaW50IGZpbGUgb24gc2F2ZScsXG4gICAgb3JkZXI6IDI1XG4gIH0sXG4gIG9uQ2hhbmdlQ2hlY2s6IHtcbiAgICB0eXBlOiAnYm9vbGVhbicsXG4gICAgZGVmYXVsdDogZmFsc2UsXG4gICAgZGVzY3JpcHRpb246ICdDaGVjayBmaWxlIG9uIGNoYW5nZScsXG4gICAgb3JkZXI6IDI1XG4gIH0sXG4gIG9uQ2hhbmdlTGludDoge1xuICAgIHR5cGU6ICdib29sZWFuJyxcbiAgICBkZWZhdWx0OiBmYWxzZSxcbiAgICBkZXNjcmlwdGlvbjogJ0xpbnQgZmlsZSBvbiBjaGFuZ2UnLFxuICAgIG9yZGVyOiAyNVxuICB9LFxuICBvbk1vdXNlSG92ZXJTaG93OiB7XG4gICAgdHlwZTogJ3N0cmluZycsXG4gICAgZGVzY3JpcHRpb246ICdDb250ZW50cyBvZiB0b29sdGlwIG9uIG1vdXNlIGhvdmVyJyxcbiAgICBkZWZhdWx0OiAndHlwZUFuZEluZm8nLFxuICAgIGVudW06IHRvb2x0aXBBY3Rpb25zLFxuICAgIG9yZGVyOiAzMFxuICB9LFxuICBvblNlbGVjdGlvblNob3c6IHtcbiAgICB0eXBlOiAnc3RyaW5nJyxcbiAgICBkZXNjcmlwdGlvbjogJ0NvbnRlbnRzIG9mIHRvb2x0aXAgb24gc2VsZWN0aW9uJyxcbiAgICBkZWZhdWx0OiAnJyxcbiAgICBlbnVtOiB0b29sdGlwQWN0aW9ucyxcbiAgICBvcmRlcjogMzBcbiAgfSxcbiAgbWF4QnJvd3NlUHJvY2Vzc2VzOiB7XG4gICAgdHlwZTogJ2ludGVnZXInLFxuICAgIGRlZmF1bHQ6IDIsXG4gICAgZGVzY3JpcHRpb246IGBNYXhpbXVtIG51bWJlciBvZiBwYXJhbGxlbCBnaGMtbW9kIGJyb3dzZSBwcm9jZXNzZXMsIHdoaWNoIFxcXG5hcmUgdXNlZCBpbiBhdXRvY29tcGxldGlvbiBiYWNrZW5kIGluaXRpYWxpemF0aW9uLiBcXFxuTm90ZSB0aGF0IG9uIGxhcmdlciBwcm9qZWN0cyBpdCBtYXkgcmVxdWlyZSBhIGNvbnNpZGVyYWJsZSBcXFxuYW1vdW50IG9mIG1lbW9yeS5gLFxuICAgIG9yZGVyOiA2MFxuICB9LFxuICBoaWdobGlnaHRUb29sdGlwczoge1xuICAgIHR5cGU6ICdib29sZWFuJyxcbiAgICBkZWZhdWx0OiB0cnVlLFxuICAgIGRlc2NyaXB0aW9uOiAnU2hvdyBoaWdobGlnaHRpbmcgZm9yIHR5cGUvaW5mbyB0b29sdGlwcycsXG4gICAgb3JkZXI6IDQwXG4gIH0sXG4gIGhpZ2hsaWdodE1lc3NhZ2VzOiB7XG4gICAgdHlwZTogJ2Jvb2xlYW4nLFxuICAgIGRlZmF1bHQ6IHRydWUsXG4gICAgZGVzY3JpcHRpb246ICdTaG93IGhpZ2hsaWdodGluZyBmb3Igb3V0cHV0IHBhbmVsIG1lc3NhZ2VzJyxcbiAgICBvcmRlcjogNDBcbiAgfSxcbiAgaGxpbnRPcHRpb25zOiB7XG4gICAgdHlwZTogJ2FycmF5JyxcbiAgICBkZWZhdWx0OiBbXSxcbiAgICBkZXNjcmlwdGlvbjogJ0NvbW1hbmQgbGluZSBvcHRpb25zIHRvIHBhc3MgdG8gaGxpbnQgKGNvbW1hLXNlcGFyYXRlZCknLFxuICAgIG9yZGVyOiA0NVxuICB9LFxuICBleHBlcmltZW50YWw6IHtcbiAgICB0eXBlOiAnYm9vbGVhbicsXG4gICAgZGVmYXVsdDogZmFsc2UsXG4gICAgZGVzY3JpcHRpb246IGBFbmFibGUgZXhwZXJpbWVudGFsIGZlYXR1cmVzLCB3aGljaCBhcmUgZXhwZWN0ZWQgdG8gbGFuZCBpbiBcXFxubmV4dCByZWxlYXNlIG9mIGdoYy1tb2QuIEVOQUJMRSBPTkxZIElGIFlPVSBLTk9XIFdIQVQgWU9VIFxcXG5BUkUgRE9JTkdgLFxuICAgIG9yZGVyOiA5OTlcbiAgfSxcbiAgc3VwcHJlc3NHaGNQYWNrYWdlUGF0aFdhcm5pbmc6IHtcbiAgICB0eXBlOiAnYm9vbGVhbicsXG4gICAgZGVmYXVsdDogZmFsc2UsXG4gICAgZGVzY3JpcHRpb246IGBTdXBwcmVzcyB3YXJuaW5nIGFib3V0IEdIQ19QQUNLQUdFX1BBVEggZW52aXJvbm1lbnQgdmFyaWFibGUuIFxcXG5FTkFCTEUgT05MWSBJRiBZT1UgS05PVyBXSEFUIFlPVSBBUkUgRE9JTkcuYCxcbiAgICBvcmRlcjogOTk5XG4gIH0sXG4gIGdoY01vZE1lc3NhZ2VzOiB7XG4gICAgdHlwZTogJ3N0cmluZycsXG4gICAgZGVzY3JpcHRpb246ICdIb3cgdG8gc2hvdyB3YXJuaW5ncy9lcnJvcnMgcmVwb3J0ZWQgYnkgZ2hjLW1vZCAocmVxdWlyZXMgcmVzdGFydCknLFxuICAgIGRlZmF1bHQ6ICdjb25zb2xlJyxcbiAgICBlbnVtOiBbXG4gICAgICB7dmFsdWU6ICdjb25zb2xlJywgZGVzY3JpcHRpb246ICdEZXZlbG9wZXIgQ29uc29sZSd9LFxuICAgICAge3ZhbHVlOiAndXBpJywgZGVzY3JpcHRpb246ICdPdXRwdXQgUGFuZWwnfSxcbiAgICAgIHt2YWx1ZTogJ3BvcHVwJywgZGVzY3JpcHRpb246ICdFcnJvci9XYXJuaW5nIFBvcHVwcyd9LFxuICAgIF0sXG4gICAgb3JkZXI6IDQyXG4gIH1cbn1cbiJdfQ==