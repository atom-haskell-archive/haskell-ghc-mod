"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tooltipActions = [
    { value: '', description: 'Nothing' },
    { value: 'type', description: 'Type' },
    { value: 'info', description: 'Info' },
    { value: 'infoType', description: 'Info, fallback to Type' },
    { value: 'typeInfo', description: 'Type, fallback to Info' },
    { value: 'typeAndInfo', description: 'Type and Info' },
];
exports.config = {
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
        description: 'How to show warnings/errors reported by ghc-mod (requires restart)',
        default: 'console',
        enum: [
            { value: 'console', description: 'Developer Console' },
            { value: 'upi', description: 'Output Panel' },
            { value: 'popup', description: 'Error/Warning Popups' },
        ],
        order: 42,
    },
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlnLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2NvbmZpZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLE1BQU0sY0FBYyxHQUNsQjtJQUNFLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRSxXQUFXLEVBQUUsU0FBUyxFQUFFO0lBQ3JDLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFFO0lBQ3RDLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFFO0lBQ3RDLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRSxXQUFXLEVBQUUsd0JBQXdCLEVBQUU7SUFDNUQsRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFLFdBQVcsRUFBRSx3QkFBd0IsRUFBRTtJQUM1RCxFQUFFLEtBQUssRUFBRSxhQUFhLEVBQUUsV0FBVyxFQUFFLGVBQWUsRUFBRTtDQUN2RCxDQUFBO0FBRVUsUUFBQSxNQUFNLEdBQUc7SUFDcEIsVUFBVSxFQUFFO1FBQ1YsSUFBSSxFQUFFLFFBQVE7UUFDZCxPQUFPLEVBQUUsU0FBUztRQUNsQixXQUFXLEVBQUUsaUJBQWlCO1FBQzlCLEtBQUssRUFBRSxDQUFDO0tBQ1Q7SUFDRCxhQUFhLEVBQUU7UUFDYixJQUFJLEVBQUUsU0FBUztRQUNmLE9BQU8sRUFBRSxJQUFJO1FBQ2IsV0FBVyxFQUNYOytEQUMyRDtRQUMzRCxLQUFLLEVBQUUsRUFBRTtLQUNWO0lBQ0QsZUFBZSxFQUFFO1FBQ2YsSUFBSSxFQUFFLFNBQVM7UUFDZixPQUFPLEVBQUUsS0FBSztRQUNkLFdBQVcsRUFDWDtpREFDNkM7UUFDN0MsS0FBSyxFQUFFLEVBQUU7S0FDVjtJQUNELEtBQUssRUFBRTtRQUNMLElBQUksRUFBRSxTQUFTO1FBQ2YsT0FBTyxFQUFFLEtBQUs7UUFDZCxLQUFLLEVBQUUsR0FBRztLQUNYO0lBQ0QseUJBQXlCLEVBQUU7UUFDekIsSUFBSSxFQUFFLE9BQU87UUFDYixP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UztRQUNmLE9BQU8sRUFBRSxLQUFLO1FBQ2QsV0FBVyxFQUFFOztVQUVQO1FBQ04sS0FBSyxFQUFFLEdBQUc7S0FDWDtJQUNELDZCQUE2QixFQUFFO1FBQzdCLElBQUksRUFBRSxTQUFTO1FBQ2YsT0FBTyxFQUFFLEtBQUs7UUFDZCxXQUFXLEVBQUU7NENBQzJCO1FBQ3hDLEtBQUssRUFBRSxHQUFHO0tBQ1g7SUFDRCxjQUFjLEVBQUU7UUFDZCxJQUFJLEVBQUUsUUFBUTtRQUNkLFdBQVcsRUFBRSxvRUFBb0U7UUFDakYsT0FBTyxFQUFFLFNBQVM7UUFDbEIsSUFBSSxFQUFFO1lBQ0osRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLFdBQVcsRUFBRSxtQkFBbUIsRUFBRTtZQUN0RCxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsV0FBVyxFQUFFLGNBQWMsRUFBRTtZQUM3QyxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUUsV0FBVyxFQUFFLHNCQUFzQixFQUFFO1NBQ3hEO1FBQ0QsS0FBSyxFQUFFLEVBQUU7S0FDVjtDQUNGLENBQUEiLCJzb3VyY2VzQ29udGVudCI6WyJjb25zdCB0b29sdGlwQWN0aW9ucyA9XG4gIFtcbiAgICB7IHZhbHVlOiAnJywgZGVzY3JpcHRpb246ICdOb3RoaW5nJyB9LFxuICAgIHsgdmFsdWU6ICd0eXBlJywgZGVzY3JpcHRpb246ICdUeXBlJyB9LFxuICAgIHsgdmFsdWU6ICdpbmZvJywgZGVzY3JpcHRpb246ICdJbmZvJyB9LFxuICAgIHsgdmFsdWU6ICdpbmZvVHlwZScsIGRlc2NyaXB0aW9uOiAnSW5mbywgZmFsbGJhY2sgdG8gVHlwZScgfSxcbiAgICB7IHZhbHVlOiAndHlwZUluZm8nLCBkZXNjcmlwdGlvbjogJ1R5cGUsIGZhbGxiYWNrIHRvIEluZm8nIH0sXG4gICAgeyB2YWx1ZTogJ3R5cGVBbmRJbmZvJywgZGVzY3JpcHRpb246ICdUeXBlIGFuZCBJbmZvJyB9LFxuICBdXG5cbmV4cG9ydCBjb25zdCBjb25maWcgPSB7XG4gIGdoY01vZFBhdGg6IHtcbiAgICB0eXBlOiAnc3RyaW5nJyxcbiAgICBkZWZhdWx0OiAnZ2hjLW1vZCcsXG4gICAgZGVzY3JpcHRpb246ICdQYXRoIHRvIGdoYy1tb2QnLFxuICAgIG9yZGVyOiAwLFxuICB9LFxuICBlbmFibGVHaGNNb2RpOiB7XG4gICAgdHlwZTogJ2Jvb2xlYW4nLFxuICAgIGRlZmF1bHQ6IHRydWUsXG4gICAgZGVzY3JpcHRpb246XG4gICAgYFVzaW5nIEdIQyBNb2RpIGlzIHN1Z2dlc3RlZCBhbmQgbm90aWNlYWJseSBmYXN0ZXIsIFxcXG5idXQgaWYgZXhwZXJpZW5jaW5nIHByb2JsZW1zLCBkaXNhYmxpbmcgaXQgY2FuIHNvbWV0aW1lcyBoZWxwLmAsXG4gICAgb3JkZXI6IDcwLFxuICB9LFxuICBsb3dNZW1vcnlTeXN0ZW06IHtcbiAgICB0eXBlOiAnYm9vbGVhbicsXG4gICAgZGVmYXVsdDogZmFsc2UsXG4gICAgZGVzY3JpcHRpb246XG4gICAgYEF2b2lkIHNwYXduaW5nIG1vcmUgdGhhbiBvbmUgZ2hjLW1vZCBwcm9jZXNzOyBhbHNvIGRpc2FibGVzIHBhcmFsbGVsIFxcXG5mZWF0dXJlcywgd2hpY2ggY2FuIGhlbHAgd2l0aCB3ZWlyZCBzdGFjayBlcnJvcnNgLFxuICAgIG9yZGVyOiA3MCxcbiAgfSxcbiAgZGVidWc6IHtcbiAgICB0eXBlOiAnYm9vbGVhbicsXG4gICAgZGVmYXVsdDogZmFsc2UsXG4gICAgb3JkZXI6IDk5OSxcbiAgfSxcbiAgYWRkaXRpb25hbFBhdGhEaXJlY3Rvcmllczoge1xuICAgIHR5cGU6ICdhcnJheScsXG4gICAgZGVmYXVsdDogW10sXG4gICAgZGVzY3JpcHRpb246IGBBZGQgdGhpcyBkaXJlY3RvcmllcyB0byBQQVRIIHdoZW4gaW52b2tpbmcgZ2hjLW1vZC4gXFxcbllvdSBtaWdodCB3YW50IHRvIGFkZCBwYXRoIHRvIGEgZGlyZWN0b3J5IHdpdGggXFxcbmdoYywgY2FiYWwsIGV0YyBiaW5hcmllcyBoZXJlLiBcXFxuU2VwYXJhdGUgd2l0aCBjb21tYS5gLFxuICAgIGl0ZW1zOiB7XG4gICAgICB0eXBlOiAnc3RyaW5nJyxcbiAgICB9LFxuICAgIG9yZGVyOiAwLFxuICB9LFxuICBjYWJhbFNhbmRib3g6IHtcbiAgICB0eXBlOiAnYm9vbGVhbicsXG4gICAgZGVmYXVsdDogdHJ1ZSxcbiAgICBkZXNjcmlwdGlvbjogJ0FkZCBjYWJhbCBzYW5kYm94IGJpbi1wYXRoIHRvIFBBVEgnLFxuICAgIG9yZGVyOiAxMDAsXG4gIH0sXG4gIHN0YWNrU2FuZGJveDoge1xuICAgIHR5cGU6ICdib29sZWFuJyxcbiAgICBkZWZhdWx0OiB0cnVlLFxuICAgIGRlc2NyaXB0aW9uOiAnQWRkIHN0YWNrIGJpbi1wYXRoIHRvIFBBVEgnLFxuICAgIG9yZGVyOiAxMDAsXG4gIH0sXG4gIGluaXRUaW1lb3V0OiB7XG4gICAgdHlwZTogJ2ludGVnZXInLFxuICAgIGRlc2NyaXB0aW9uOiBgSG93IGxvbmcgdG8gd2FpdCBmb3IgaW5pdGlhbGl6YXRpb24gY29tbWFuZHMgKGNoZWNraW5nIFxcXG5HSEMgYW5kIGdoYy1tb2QgdmVyc2lvbnMsIGdldHRpbmcgc3RhY2sgc2FuZGJveCkgdW50aWwgXFxcbmFzc3VtaW5nIHRob3NlIGhhbmdlZCBhbmQgYmFpbGluZy4gSW4gc2Vjb25kcy5gLFxuICAgIGRlZmF1bHQ6IDYwLFxuICAgIG1pbmltdW06IDEsXG4gICAgb3JkZXI6IDUwLFxuICB9LFxuICBpbnRlcmFjdGl2ZUluYWN0aXZpdHlUaW1lb3V0OiB7XG4gICAgdHlwZTogJ2ludGVnZXInLFxuICAgIGRlc2NyaXB0aW9uOiBgS2lsbCBnaGMtbW9kIGludGVyYWN0aXZlIHByb2Nlc3MgKGdoYy1tb2RpKSBhZnRlciB0aGlzIFxcXG5udW1iZXIgb2YgbWludXRlcyBvZiBpbmFjdGl2aXR5IHRvIGNvbnNlcnZlIG1lbW9yeS4gMCBcXFxubWVhbnMgbmV2ZXIuYCxcbiAgICBkZWZhdWx0OiA2MCxcbiAgICBtaW5pbXVtOiAwLFxuICAgIG9yZGVyOiA1MCxcbiAgfSxcbiAgaW50ZXJhY3RpdmVBY3Rpb25UaW1lb3V0OiB7XG4gICAgdHlwZTogJ2ludGVnZXInLFxuICAgIGRlc2NyaXB0aW9uOiBgVGltZW91dCBmb3IgaW50ZXJhY3RpdmUgZ2hjLW1vZCBjb21tYW5kcyAoaW4gc2Vjb25kcykuIDAgXFxcbm1lYW5zIHdhaXQgZm9yZXZlci5gLFxuICAgIGRlZmF1bHQ6IDMwMCxcbiAgICBtaW5pbXVtOiAwLFxuICAgIG9yZGVyOiA1MCxcbiAgfSxcbiAgb25TYXZlQ2hlY2s6IHtcbiAgICB0eXBlOiAnYm9vbGVhbicsXG4gICAgZGVmYXVsdDogdHJ1ZSxcbiAgICBkZXNjcmlwdGlvbjogJ0NoZWNrIGZpbGUgb24gc2F2ZScsXG4gICAgb3JkZXI6IDI1LFxuICB9LFxuICBvblNhdmVMaW50OiB7XG4gICAgdHlwZTogJ2Jvb2xlYW4nLFxuICAgIGRlZmF1bHQ6IHRydWUsXG4gICAgZGVzY3JpcHRpb246ICdMaW50IGZpbGUgb24gc2F2ZScsXG4gICAgb3JkZXI6IDI1LFxuICB9LFxuICBvbkNoYW5nZUNoZWNrOiB7XG4gICAgdHlwZTogJ2Jvb2xlYW4nLFxuICAgIGRlZmF1bHQ6IGZhbHNlLFxuICAgIGRlc2NyaXB0aW9uOiAnQ2hlY2sgZmlsZSBvbiBjaGFuZ2UnLFxuICAgIG9yZGVyOiAyNSxcbiAgfSxcbiAgb25DaGFuZ2VMaW50OiB7XG4gICAgdHlwZTogJ2Jvb2xlYW4nLFxuICAgIGRlZmF1bHQ6IGZhbHNlLFxuICAgIGRlc2NyaXB0aW9uOiAnTGludCBmaWxlIG9uIGNoYW5nZScsXG4gICAgb3JkZXI6IDI1LFxuICB9LFxuICBvbk1vdXNlSG92ZXJTaG93OiB7XG4gICAgdHlwZTogJ3N0cmluZycsXG4gICAgZGVzY3JpcHRpb246ICdDb250ZW50cyBvZiB0b29sdGlwIG9uIG1vdXNlIGhvdmVyJyxcbiAgICBkZWZhdWx0OiAndHlwZUFuZEluZm8nLFxuICAgIGVudW06IHRvb2x0aXBBY3Rpb25zLFxuICAgIG9yZGVyOiAzMCxcbiAgfSxcbiAgb25TZWxlY3Rpb25TaG93OiB7XG4gICAgdHlwZTogJ3N0cmluZycsXG4gICAgZGVzY3JpcHRpb246ICdDb250ZW50cyBvZiB0b29sdGlwIG9uIHNlbGVjdGlvbicsXG4gICAgZGVmYXVsdDogJycsXG4gICAgZW51bTogdG9vbHRpcEFjdGlvbnMsXG4gICAgb3JkZXI6IDMwLFxuICB9LFxuICBtYXhCcm93c2VQcm9jZXNzZXM6IHtcbiAgICB0eXBlOiAnaW50ZWdlcicsXG4gICAgZGVmYXVsdDogMixcbiAgICBkZXNjcmlwdGlvbjogYE1heGltdW0gbnVtYmVyIG9mIHBhcmFsbGVsIGdoYy1tb2QgYnJvd3NlIHByb2Nlc3Nlcywgd2hpY2ggXFxcbmFyZSB1c2VkIGluIGF1dG9jb21wbGV0aW9uIGJhY2tlbmQgaW5pdGlhbGl6YXRpb24uIFxcXG5Ob3RlIHRoYXQgb24gbGFyZ2VyIHByb2plY3RzIGl0IG1heSByZXF1aXJlIGEgY29uc2lkZXJhYmxlIFxcXG5hbW91bnQgb2YgbWVtb3J5LmAsXG4gICAgb3JkZXI6IDYwLFxuICB9LFxuICBoaWdobGlnaHRUb29sdGlwczoge1xuICAgIHR5cGU6ICdib29sZWFuJyxcbiAgICBkZWZhdWx0OiB0cnVlLFxuICAgIGRlc2NyaXB0aW9uOiAnU2hvdyBoaWdobGlnaHRpbmcgZm9yIHR5cGUvaW5mbyB0b29sdGlwcycsXG4gICAgb3JkZXI6IDQwLFxuICB9LFxuICBoaWdobGlnaHRNZXNzYWdlczoge1xuICAgIHR5cGU6ICdib29sZWFuJyxcbiAgICBkZWZhdWx0OiB0cnVlLFxuICAgIGRlc2NyaXB0aW9uOiAnU2hvdyBoaWdobGlnaHRpbmcgZm9yIG91dHB1dCBwYW5lbCBtZXNzYWdlcycsXG4gICAgb3JkZXI6IDQwLFxuICB9LFxuICBobGludE9wdGlvbnM6IHtcbiAgICB0eXBlOiAnYXJyYXknLFxuICAgIGRlZmF1bHQ6IFtdLFxuICAgIGRlc2NyaXB0aW9uOiAnQ29tbWFuZCBsaW5lIG9wdGlvbnMgdG8gcGFzcyB0byBobGludCAoY29tbWEtc2VwYXJhdGVkKScsXG4gICAgb3JkZXI6IDQ1LFxuICB9LFxuICBleHBlcmltZW50YWw6IHtcbiAgICB0eXBlOiAnYm9vbGVhbicsXG4gICAgZGVmYXVsdDogZmFsc2UsXG4gICAgZGVzY3JpcHRpb246IGBFbmFibGUgZXhwZXJpbWVudGFsIGZlYXR1cmVzLCB3aGljaCBhcmUgZXhwZWN0ZWQgdG8gbGFuZCBpbiBcXFxubmV4dCByZWxlYXNlIG9mIGdoYy1tb2QuIEVOQUJMRSBPTkxZIElGIFlPVSBLTk9XIFdIQVQgWU9VIFxcXG5BUkUgRE9JTkdgLFxuICAgIG9yZGVyOiA5OTksXG4gIH0sXG4gIHN1cHByZXNzR2hjUGFja2FnZVBhdGhXYXJuaW5nOiB7XG4gICAgdHlwZTogJ2Jvb2xlYW4nLFxuICAgIGRlZmF1bHQ6IGZhbHNlLFxuICAgIGRlc2NyaXB0aW9uOiBgU3VwcHJlc3Mgd2FybmluZyBhYm91dCBHSENfUEFDS0FHRV9QQVRIIGVudmlyb25tZW50IHZhcmlhYmxlLiBcXFxuRU5BQkxFIE9OTFkgSUYgWU9VIEtOT1cgV0hBVCBZT1UgQVJFIERPSU5HLmAsXG4gICAgb3JkZXI6IDk5OSxcbiAgfSxcbiAgZ2hjTW9kTWVzc2FnZXM6IHtcbiAgICB0eXBlOiAnc3RyaW5nJyxcbiAgICBkZXNjcmlwdGlvbjogJ0hvdyB0byBzaG93IHdhcm5pbmdzL2Vycm9ycyByZXBvcnRlZCBieSBnaGMtbW9kIChyZXF1aXJlcyByZXN0YXJ0KScsXG4gICAgZGVmYXVsdDogJ2NvbnNvbGUnLFxuICAgIGVudW06IFtcbiAgICAgIHsgdmFsdWU6ICdjb25zb2xlJywgZGVzY3JpcHRpb246ICdEZXZlbG9wZXIgQ29uc29sZScgfSxcbiAgICAgIHsgdmFsdWU6ICd1cGknLCBkZXNjcmlwdGlvbjogJ091dHB1dCBQYW5lbCcgfSxcbiAgICAgIHsgdmFsdWU6ICdwb3B1cCcsIGRlc2NyaXB0aW9uOiAnRXJyb3IvV2FybmluZyBQb3B1cHMnIH0sXG4gICAgXSxcbiAgICBvcmRlcjogNDIsXG4gIH0sXG59XG4iXX0=