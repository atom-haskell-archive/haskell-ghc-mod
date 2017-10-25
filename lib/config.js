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
    maxMemMegs: {
        type: 'integer',
        descrition: 'Maximum ghc-mod interactive mode memory usage (in megabytes)',
        default: 4 * 1024,
        minimum: 1024,
        order: 50,
    },
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlnLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2NvbmZpZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLE1BQU0sY0FBYyxHQUNsQjtJQUNFLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRSxXQUFXLEVBQUUsU0FBUyxFQUFFO0lBQ3JDLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFFO0lBQ3RDLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFFO0lBQ3RDLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRSxXQUFXLEVBQUUsd0JBQXdCLEVBQUU7SUFDNUQsRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFLFdBQVcsRUFBRSx3QkFBd0IsRUFBRTtJQUM1RCxFQUFFLEtBQUssRUFBRSxhQUFhLEVBQUUsV0FBVyxFQUFFLGVBQWUsRUFBRTtDQUN2RCxDQUFBO0FBRVUsUUFBQSxNQUFNLEdBQUc7SUFDcEIsVUFBVSxFQUFFO1FBQ1YsSUFBSSxFQUFFLFFBQVE7UUFDZCxPQUFPLEVBQUUsU0FBUztRQUNsQixXQUFXLEVBQUUsaUJBQWlCO1FBQzlCLEtBQUssRUFBRSxDQUFDO0tBQ1Q7SUFDRCxhQUFhLEVBQUU7UUFDYixJQUFJLEVBQUUsU0FBUztRQUNmLE9BQU8sRUFBRSxJQUFJO1FBQ2IsV0FBVyxFQUNYOytEQUMyRDtRQUMzRCxLQUFLLEVBQUUsRUFBRTtLQUNWO0lBQ0QsZUFBZSxFQUFFO1FBQ2YsSUFBSSxFQUFFLFNBQVM7UUFDZixPQUFPLEVBQUUsS0FBSztRQUNkLFdBQVcsRUFDWDtpREFDNkM7UUFDN0MsS0FBSyxFQUFFLEVBQUU7S0FDVjtJQUNELEtBQUssRUFBRTtRQUNMLElBQUksRUFBRSxTQUFTO1FBQ2YsT0FBTyxFQUFFLEtBQUs7UUFDZCxLQUFLLEVBQUUsR0FBRztLQUNYO0lBQ0QseUJBQXlCLEVBQUU7UUFDekIsSUFBSSxFQUFFLE9BQU87UUFDYixP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QU87UUFDYixPQUFPLEVBQUUsRUFBRTtRQUNYLFdBQVcsRUFBRSx5REFBeUQ7UUFDdEUsS0FBSyxFQUFFLEVBQUU7S0FDVjtJQUNELFlBQVksRUFBRTtRQUNaLElBQUksRUFBRSxTQUFTO1FBQ2YsT0FBTyxFQUFFLEtBQUs7UUFDZCxXQUFXLEVBQUU7O1VBRVA7UUFDTixLQUFLLEVBQUUsR0FBRztLQUNYO0lBQ0QsNkJBQTZCLEVBQUU7UUFDN0IsSUFBSSxFQUFFLFNBQVM7UUFDZixPQUFPLEVBQUUsS0FBSztRQUNkLFdBQVcsRUFBRTs0Q0FDMkI7UUFDeEMsS0FBSyxFQUFFLEdBQUc7S0FDWDtJQUNELGNBQWMsRUFBRTtRQUNkLElBQUksRUFBRSxRQUFRO1FBQ2QsV0FBVyxFQUFFLG9FQUFvRTtRQUNqRixPQUFPLEVBQUUsU0FBUztRQUNsQixJQUFJLEVBQUU7WUFDSixFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUUsV0FBVyxFQUFFLG1CQUFtQixFQUFFO1lBQ3RELEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxXQUFXLEVBQUUsY0FBYyxFQUFFO1lBQzdDLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxXQUFXLEVBQUUsc0JBQXNCLEVBQUU7U0FDeEQ7UUFDRCxLQUFLLEVBQUUsRUFBRTtLQUNWO0lBQ0QsVUFBVSxFQUFFO1FBQ1YsSUFBSSxFQUFFLFNBQVM7UUFDZixVQUFVLEVBQUUsOERBQThEO1FBQzFFLE9BQU8sRUFBRSxDQUFDLEdBQUcsSUFBSTtRQUNqQixPQUFPLEVBQUUsSUFBSTtRQUNiLEtBQUssRUFBRSxFQUFFO0tBQ1Y7Q0FDRixDQUFBIiwic291cmNlc0NvbnRlbnQiOlsiY29uc3QgdG9vbHRpcEFjdGlvbnMgPVxuICBbXG4gICAgeyB2YWx1ZTogJycsIGRlc2NyaXB0aW9uOiAnTm90aGluZycgfSxcbiAgICB7IHZhbHVlOiAndHlwZScsIGRlc2NyaXB0aW9uOiAnVHlwZScgfSxcbiAgICB7IHZhbHVlOiAnaW5mbycsIGRlc2NyaXB0aW9uOiAnSW5mbycgfSxcbiAgICB7IHZhbHVlOiAnaW5mb1R5cGUnLCBkZXNjcmlwdGlvbjogJ0luZm8sIGZhbGxiYWNrIHRvIFR5cGUnIH0sXG4gICAgeyB2YWx1ZTogJ3R5cGVJbmZvJywgZGVzY3JpcHRpb246ICdUeXBlLCBmYWxsYmFjayB0byBJbmZvJyB9LFxuICAgIHsgdmFsdWU6ICd0eXBlQW5kSW5mbycsIGRlc2NyaXB0aW9uOiAnVHlwZSBhbmQgSW5mbycgfSxcbiAgXVxuXG5leHBvcnQgY29uc3QgY29uZmlnID0ge1xuICBnaGNNb2RQYXRoOiB7XG4gICAgdHlwZTogJ3N0cmluZycsXG4gICAgZGVmYXVsdDogJ2doYy1tb2QnLFxuICAgIGRlc2NyaXB0aW9uOiAnUGF0aCB0byBnaGMtbW9kJyxcbiAgICBvcmRlcjogMCxcbiAgfSxcbiAgZW5hYmxlR2hjTW9kaToge1xuICAgIHR5cGU6ICdib29sZWFuJyxcbiAgICBkZWZhdWx0OiB0cnVlLFxuICAgIGRlc2NyaXB0aW9uOlxuICAgIGBVc2luZyBHSEMgTW9kaSBpcyBzdWdnZXN0ZWQgYW5kIG5vdGljZWFibHkgZmFzdGVyLCBcXFxuYnV0IGlmIGV4cGVyaWVuY2luZyBwcm9ibGVtcywgZGlzYWJsaW5nIGl0IGNhbiBzb21ldGltZXMgaGVscC5gLFxuICAgIG9yZGVyOiA3MCxcbiAgfSxcbiAgbG93TWVtb3J5U3lzdGVtOiB7XG4gICAgdHlwZTogJ2Jvb2xlYW4nLFxuICAgIGRlZmF1bHQ6IGZhbHNlLFxuICAgIGRlc2NyaXB0aW9uOlxuICAgIGBBdm9pZCBzcGF3bmluZyBtb3JlIHRoYW4gb25lIGdoYy1tb2QgcHJvY2VzczsgYWxzbyBkaXNhYmxlcyBwYXJhbGxlbCBcXFxuZmVhdHVyZXMsIHdoaWNoIGNhbiBoZWxwIHdpdGggd2VpcmQgc3RhY2sgZXJyb3JzYCxcbiAgICBvcmRlcjogNzAsXG4gIH0sXG4gIGRlYnVnOiB7XG4gICAgdHlwZTogJ2Jvb2xlYW4nLFxuICAgIGRlZmF1bHQ6IGZhbHNlLFxuICAgIG9yZGVyOiA5OTksXG4gIH0sXG4gIGFkZGl0aW9uYWxQYXRoRGlyZWN0b3JpZXM6IHtcbiAgICB0eXBlOiAnYXJyYXknLFxuICAgIGRlZmF1bHQ6IFtdLFxuICAgIGRlc2NyaXB0aW9uOiBgQWRkIHRoaXMgZGlyZWN0b3JpZXMgdG8gUEFUSCB3aGVuIGludm9raW5nIGdoYy1tb2QuIFxcXG5Zb3UgbWlnaHQgd2FudCB0byBhZGQgcGF0aCB0byBhIGRpcmVjdG9yeSB3aXRoIFxcXG5naGMsIGNhYmFsLCBldGMgYmluYXJpZXMgaGVyZS4gXFxcblNlcGFyYXRlIHdpdGggY29tbWEuYCxcbiAgICBpdGVtczoge1xuICAgICAgdHlwZTogJ3N0cmluZycsXG4gICAgfSxcbiAgICBvcmRlcjogMCxcbiAgfSxcbiAgY2FiYWxTYW5kYm94OiB7XG4gICAgdHlwZTogJ2Jvb2xlYW4nLFxuICAgIGRlZmF1bHQ6IHRydWUsXG4gICAgZGVzY3JpcHRpb246ICdBZGQgY2FiYWwgc2FuZGJveCBiaW4tcGF0aCB0byBQQVRIJyxcbiAgICBvcmRlcjogMTAwLFxuICB9LFxuICBzdGFja1NhbmRib3g6IHtcbiAgICB0eXBlOiAnYm9vbGVhbicsXG4gICAgZGVmYXVsdDogdHJ1ZSxcbiAgICBkZXNjcmlwdGlvbjogJ0FkZCBzdGFjayBiaW4tcGF0aCB0byBQQVRIJyxcbiAgICBvcmRlcjogMTAwLFxuICB9LFxuICBpbml0VGltZW91dDoge1xuICAgIHR5cGU6ICdpbnRlZ2VyJyxcbiAgICBkZXNjcmlwdGlvbjogYEhvdyBsb25nIHRvIHdhaXQgZm9yIGluaXRpYWxpemF0aW9uIGNvbW1hbmRzIChjaGVja2luZyBcXFxuR0hDIGFuZCBnaGMtbW9kIHZlcnNpb25zLCBnZXR0aW5nIHN0YWNrIHNhbmRib3gpIHVudGlsIFxcXG5hc3N1bWluZyB0aG9zZSBoYW5nZWQgYW5kIGJhaWxpbmcuIEluIHNlY29uZHMuYCxcbiAgICBkZWZhdWx0OiA2MCxcbiAgICBtaW5pbXVtOiAxLFxuICAgIG9yZGVyOiA1MCxcbiAgfSxcbiAgaW50ZXJhY3RpdmVJbmFjdGl2aXR5VGltZW91dDoge1xuICAgIHR5cGU6ICdpbnRlZ2VyJyxcbiAgICBkZXNjcmlwdGlvbjogYEtpbGwgZ2hjLW1vZCBpbnRlcmFjdGl2ZSBwcm9jZXNzIChnaGMtbW9kaSkgYWZ0ZXIgdGhpcyBcXFxubnVtYmVyIG9mIG1pbnV0ZXMgb2YgaW5hY3Rpdml0eSB0byBjb25zZXJ2ZSBtZW1vcnkuIDAgXFxcbm1lYW5zIG5ldmVyLmAsXG4gICAgZGVmYXVsdDogNjAsXG4gICAgbWluaW11bTogMCxcbiAgICBvcmRlcjogNTAsXG4gIH0sXG4gIGludGVyYWN0aXZlQWN0aW9uVGltZW91dDoge1xuICAgIHR5cGU6ICdpbnRlZ2VyJyxcbiAgICBkZXNjcmlwdGlvbjogYFRpbWVvdXQgZm9yIGludGVyYWN0aXZlIGdoYy1tb2QgY29tbWFuZHMgKGluIHNlY29uZHMpLiAwIFxcXG5tZWFucyB3YWl0IGZvcmV2ZXIuYCxcbiAgICBkZWZhdWx0OiAzMDAsXG4gICAgbWluaW11bTogMCxcbiAgICBvcmRlcjogNTAsXG4gIH0sXG4gIG9uU2F2ZUNoZWNrOiB7XG4gICAgdHlwZTogJ2Jvb2xlYW4nLFxuICAgIGRlZmF1bHQ6IHRydWUsXG4gICAgZGVzY3JpcHRpb246ICdDaGVjayBmaWxlIG9uIHNhdmUnLFxuICAgIG9yZGVyOiAyNSxcbiAgfSxcbiAgb25TYXZlTGludDoge1xuICAgIHR5cGU6ICdib29sZWFuJyxcbiAgICBkZWZhdWx0OiB0cnVlLFxuICAgIGRlc2NyaXB0aW9uOiAnTGludCBmaWxlIG9uIHNhdmUnLFxuICAgIG9yZGVyOiAyNSxcbiAgfSxcbiAgb25DaGFuZ2VDaGVjazoge1xuICAgIHR5cGU6ICdib29sZWFuJyxcbiAgICBkZWZhdWx0OiBmYWxzZSxcbiAgICBkZXNjcmlwdGlvbjogJ0NoZWNrIGZpbGUgb24gY2hhbmdlJyxcbiAgICBvcmRlcjogMjUsXG4gIH0sXG4gIG9uQ2hhbmdlTGludDoge1xuICAgIHR5cGU6ICdib29sZWFuJyxcbiAgICBkZWZhdWx0OiBmYWxzZSxcbiAgICBkZXNjcmlwdGlvbjogJ0xpbnQgZmlsZSBvbiBjaGFuZ2UnLFxuICAgIG9yZGVyOiAyNSxcbiAgfSxcbiAgYWx3YXlzSW50ZXJhY3RpdmVDaGVjazoge1xuICAgIHR5cGU6ICdib29sZWFuJyxcbiAgICBkZWZhdWx0OiB0cnVlLFxuICAgIGRlc2NyaXB0aW9uOiBgQWx3YXlzIHVzZSBpbnRlcmFjdGl2ZSBtb2RlIGZvciBjaGVjay4gTXVjaCBmYXN0ZXIgb24gbGFyZ2UgXFxcbnByb2plY3RzLCBidXQgY2FuIGxlYWQgdG8gcHJvYmxlbXMuIFRyeSBkaXNhYmxpbmcgaWYgZXhwZXJpZW5jaW5nIHNsb3dkb3ducyBvciBcXFxuY3Jhc2hlc2AsXG4gICAgb3JkZXI6IDI2LFxuICB9LFxuICBvbk1vdXNlSG92ZXJTaG93OiB7XG4gICAgdHlwZTogJ3N0cmluZycsXG4gICAgZGVzY3JpcHRpb246ICdDb250ZW50cyBvZiB0b29sdGlwIG9uIG1vdXNlIGhvdmVyJyxcbiAgICBkZWZhdWx0OiAndHlwZUFuZEluZm8nLFxuICAgIGVudW06IHRvb2x0aXBBY3Rpb25zLFxuICAgIG9yZGVyOiAzMCxcbiAgfSxcbiAgb25TZWxlY3Rpb25TaG93OiB7XG4gICAgdHlwZTogJ3N0cmluZycsXG4gICAgZGVzY3JpcHRpb246ICdDb250ZW50cyBvZiB0b29sdGlwIG9uIHNlbGVjdGlvbicsXG4gICAgZGVmYXVsdDogJycsXG4gICAgZW51bTogdG9vbHRpcEFjdGlvbnMsXG4gICAgb3JkZXI6IDMwLFxuICB9LFxuICBtYXhCcm93c2VQcm9jZXNzZXM6IHtcbiAgICB0eXBlOiAnaW50ZWdlcicsXG4gICAgZGVmYXVsdDogMixcbiAgICBkZXNjcmlwdGlvbjogYE1heGltdW0gbnVtYmVyIG9mIHBhcmFsbGVsIGdoYy1tb2QgYnJvd3NlIHByb2Nlc3Nlcywgd2hpY2ggXFxcbmFyZSB1c2VkIGluIGF1dG9jb21wbGV0aW9uIGJhY2tlbmQgaW5pdGlhbGl6YXRpb24uIFxcXG5Ob3RlIHRoYXQgb24gbGFyZ2VyIHByb2plY3RzIGl0IG1heSByZXF1aXJlIGEgY29uc2lkZXJhYmxlIFxcXG5hbW91bnQgb2YgbWVtb3J5LmAsXG4gICAgb3JkZXI6IDYwLFxuICB9LFxuICBoaWdobGlnaHRUb29sdGlwczoge1xuICAgIHR5cGU6ICdib29sZWFuJyxcbiAgICBkZWZhdWx0OiB0cnVlLFxuICAgIGRlc2NyaXB0aW9uOiAnU2hvdyBoaWdobGlnaHRpbmcgZm9yIHR5cGUvaW5mbyB0b29sdGlwcycsXG4gICAgb3JkZXI6IDQwLFxuICB9LFxuICBoaWdobGlnaHRNZXNzYWdlczoge1xuICAgIHR5cGU6ICdib29sZWFuJyxcbiAgICBkZWZhdWx0OiB0cnVlLFxuICAgIGRlc2NyaXB0aW9uOiAnU2hvdyBoaWdobGlnaHRpbmcgZm9yIG91dHB1dCBwYW5lbCBtZXNzYWdlcycsXG4gICAgb3JkZXI6IDQwLFxuICB9LFxuICBobGludE9wdGlvbnM6IHtcbiAgICB0eXBlOiAnYXJyYXknLFxuICAgIGRlZmF1bHQ6IFtdLFxuICAgIGRlc2NyaXB0aW9uOiAnQ29tbWFuZCBsaW5lIG9wdGlvbnMgdG8gcGFzcyB0byBobGludCAoY29tbWEtc2VwYXJhdGVkKScsXG4gICAgb3JkZXI6IDQ1LFxuICB9LFxuICBleHBlcmltZW50YWw6IHtcbiAgICB0eXBlOiAnYm9vbGVhbicsXG4gICAgZGVmYXVsdDogZmFsc2UsXG4gICAgZGVzY3JpcHRpb246IGBFbmFibGUgZXhwZXJpbWVudGFsIGZlYXR1cmVzLCB3aGljaCBhcmUgZXhwZWN0ZWQgdG8gbGFuZCBpbiBcXFxubmV4dCByZWxlYXNlIG9mIGdoYy1tb2QuIEVOQUJMRSBPTkxZIElGIFlPVSBLTk9XIFdIQVQgWU9VIFxcXG5BUkUgRE9JTkdgLFxuICAgIG9yZGVyOiA5OTksXG4gIH0sXG4gIHN1cHByZXNzR2hjUGFja2FnZVBhdGhXYXJuaW5nOiB7XG4gICAgdHlwZTogJ2Jvb2xlYW4nLFxuICAgIGRlZmF1bHQ6IGZhbHNlLFxuICAgIGRlc2NyaXB0aW9uOiBgU3VwcHJlc3Mgd2FybmluZyBhYm91dCBHSENfUEFDS0FHRV9QQVRIIGVudmlyb25tZW50IHZhcmlhYmxlLiBcXFxuRU5BQkxFIE9OTFkgSUYgWU9VIEtOT1cgV0hBVCBZT1UgQVJFIERPSU5HLmAsXG4gICAgb3JkZXI6IDk5OSxcbiAgfSxcbiAgZ2hjTW9kTWVzc2FnZXM6IHtcbiAgICB0eXBlOiAnc3RyaW5nJyxcbiAgICBkZXNjcmlwdGlvbjogJ0hvdyB0byBzaG93IHdhcm5pbmdzL2Vycm9ycyByZXBvcnRlZCBieSBnaGMtbW9kIChyZXF1aXJlcyByZXN0YXJ0KScsXG4gICAgZGVmYXVsdDogJ2NvbnNvbGUnLFxuICAgIGVudW06IFtcbiAgICAgIHsgdmFsdWU6ICdjb25zb2xlJywgZGVzY3JpcHRpb246ICdEZXZlbG9wZXIgQ29uc29sZScgfSxcbiAgICAgIHsgdmFsdWU6ICd1cGknLCBkZXNjcmlwdGlvbjogJ091dHB1dCBQYW5lbCcgfSxcbiAgICAgIHsgdmFsdWU6ICdwb3B1cCcsIGRlc2NyaXB0aW9uOiAnRXJyb3IvV2FybmluZyBQb3B1cHMnIH0sXG4gICAgXSxcbiAgICBvcmRlcjogNDIsXG4gIH0sXG4gIG1heE1lbU1lZ3M6IHtcbiAgICB0eXBlOiAnaW50ZWdlcicsXG4gICAgZGVzY3JpdGlvbjogJ01heGltdW0gZ2hjLW1vZCBpbnRlcmFjdGl2ZSBtb2RlIG1lbW9yeSB1c2FnZSAoaW4gbWVnYWJ5dGVzKScsXG4gICAgZGVmYXVsdDogNCAqIDEwMjQsXG4gICAgbWluaW11bTogMTAyNCxcbiAgICBvcmRlcjogNTAsXG4gIH0sXG59XG4iXX0=