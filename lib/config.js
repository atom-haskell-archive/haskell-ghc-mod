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
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlnLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2NvbmZpZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLE1BQU0sY0FBYyxHQUNsQjtJQUNFLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRSxXQUFXLEVBQUUsU0FBUyxFQUFFO0lBQ3JDLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFFO0lBQ3RDLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFFO0lBQ3RDLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRSxXQUFXLEVBQUUsd0JBQXdCLEVBQUU7SUFDNUQsRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFLFdBQVcsRUFBRSx3QkFBd0IsRUFBRTtJQUM1RCxFQUFFLEtBQUssRUFBRSxhQUFhLEVBQUUsV0FBVyxFQUFFLGVBQWUsRUFBRTtDQUN2RCxDQUFBO0FBRVUsUUFBQSxNQUFNLEdBQUc7SUFDcEIsVUFBVSxFQUFFO1FBQ1YsSUFBSSxFQUFFLFFBQVE7UUFDZCxPQUFPLEVBQUUsU0FBUztRQUNsQixXQUFXLEVBQUUsaUJBQWlCO1FBQzlCLEtBQUssRUFBRSxDQUFDO0tBQ1Q7SUFDRCxhQUFhLEVBQUU7UUFDYixJQUFJLEVBQUUsU0FBUztRQUNmLE9BQU8sRUFBRSxJQUFJO1FBQ2IsV0FBVyxFQUNYOytEQUMyRDtRQUMzRCxLQUFLLEVBQUUsRUFBRTtLQUNWO0lBQ0QsZUFBZSxFQUFFO1FBQ2YsSUFBSSxFQUFFLFNBQVM7UUFDZixPQUFPLEVBQUUsS0FBSztRQUNkLFdBQVcsRUFDWDtpREFDNkM7UUFDN0MsS0FBSyxFQUFFLEVBQUU7S0FDVjtJQUNELEtBQUssRUFBRTtRQUNMLElBQUksRUFBRSxTQUFTO1FBQ2YsT0FBTyxFQUFFLEtBQUs7UUFDZCxLQUFLLEVBQUUsR0FBRztLQUNYO0lBQ0QseUJBQXlCLEVBQUU7UUFDekIsSUFBSSxFQUFFLE9BQU87UUFDYixP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QU87UUFDYixPQUFPLEVBQUUsRUFBRTtRQUNYLFdBQVcsRUFBRSx5REFBeUQ7UUFDdEUsS0FBSyxFQUFFLEVBQUU7S0FDVjtJQUNELFlBQVksRUFBRTtRQUNaLElBQUksRUFBRSxTQUFTO1FBQ2YsT0FBTyxFQUFFLEtBQUs7UUFDZCxXQUFXLEVBQUU7O1VBRVA7UUFDTixLQUFLLEVBQUUsR0FBRztLQUNYO0lBQ0QsNkJBQTZCLEVBQUU7UUFDN0IsSUFBSSxFQUFFLFNBQVM7UUFDZixPQUFPLEVBQUUsS0FBSztRQUNkLFdBQVcsRUFBRTs0Q0FDMkI7UUFDeEMsS0FBSyxFQUFFLEdBQUc7S0FDWDtJQUNELGNBQWMsRUFBRTtRQUNkLElBQUksRUFBRSxRQUFRO1FBQ2QsV0FBVyxFQUFFLG9FQUFvRTtRQUNqRixPQUFPLEVBQUUsU0FBUztRQUNsQixJQUFJLEVBQUU7WUFDSixFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUUsV0FBVyxFQUFFLG1CQUFtQixFQUFFO1lBQ3RELEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxXQUFXLEVBQUUsY0FBYyxFQUFFO1lBQzdDLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxXQUFXLEVBQUUsc0JBQXNCLEVBQUU7U0FDeEQ7UUFDRCxLQUFLLEVBQUUsRUFBRTtLQUNWO0NBQ0YsQ0FBQSIsInNvdXJjZXNDb250ZW50IjpbImNvbnN0IHRvb2x0aXBBY3Rpb25zID1cbiAgW1xuICAgIHsgdmFsdWU6ICcnLCBkZXNjcmlwdGlvbjogJ05vdGhpbmcnIH0sXG4gICAgeyB2YWx1ZTogJ3R5cGUnLCBkZXNjcmlwdGlvbjogJ1R5cGUnIH0sXG4gICAgeyB2YWx1ZTogJ2luZm8nLCBkZXNjcmlwdGlvbjogJ0luZm8nIH0sXG4gICAgeyB2YWx1ZTogJ2luZm9UeXBlJywgZGVzY3JpcHRpb246ICdJbmZvLCBmYWxsYmFjayB0byBUeXBlJyB9LFxuICAgIHsgdmFsdWU6ICd0eXBlSW5mbycsIGRlc2NyaXB0aW9uOiAnVHlwZSwgZmFsbGJhY2sgdG8gSW5mbycgfSxcbiAgICB7IHZhbHVlOiAndHlwZUFuZEluZm8nLCBkZXNjcmlwdGlvbjogJ1R5cGUgYW5kIEluZm8nIH0sXG4gIF1cblxuZXhwb3J0IGNvbnN0IGNvbmZpZyA9IHtcbiAgZ2hjTW9kUGF0aDoge1xuICAgIHR5cGU6ICdzdHJpbmcnLFxuICAgIGRlZmF1bHQ6ICdnaGMtbW9kJyxcbiAgICBkZXNjcmlwdGlvbjogJ1BhdGggdG8gZ2hjLW1vZCcsXG4gICAgb3JkZXI6IDAsXG4gIH0sXG4gIGVuYWJsZUdoY01vZGk6IHtcbiAgICB0eXBlOiAnYm9vbGVhbicsXG4gICAgZGVmYXVsdDogdHJ1ZSxcbiAgICBkZXNjcmlwdGlvbjpcbiAgICBgVXNpbmcgR0hDIE1vZGkgaXMgc3VnZ2VzdGVkIGFuZCBub3RpY2VhYmx5IGZhc3RlciwgXFxcbmJ1dCBpZiBleHBlcmllbmNpbmcgcHJvYmxlbXMsIGRpc2FibGluZyBpdCBjYW4gc29tZXRpbWVzIGhlbHAuYCxcbiAgICBvcmRlcjogNzAsXG4gIH0sXG4gIGxvd01lbW9yeVN5c3RlbToge1xuICAgIHR5cGU6ICdib29sZWFuJyxcbiAgICBkZWZhdWx0OiBmYWxzZSxcbiAgICBkZXNjcmlwdGlvbjpcbiAgICBgQXZvaWQgc3Bhd25pbmcgbW9yZSB0aGFuIG9uZSBnaGMtbW9kIHByb2Nlc3M7IGFsc28gZGlzYWJsZXMgcGFyYWxsZWwgXFxcbmZlYXR1cmVzLCB3aGljaCBjYW4gaGVscCB3aXRoIHdlaXJkIHN0YWNrIGVycm9yc2AsXG4gICAgb3JkZXI6IDcwLFxuICB9LFxuICBkZWJ1Zzoge1xuICAgIHR5cGU6ICdib29sZWFuJyxcbiAgICBkZWZhdWx0OiBmYWxzZSxcbiAgICBvcmRlcjogOTk5LFxuICB9LFxuICBhZGRpdGlvbmFsUGF0aERpcmVjdG9yaWVzOiB7XG4gICAgdHlwZTogJ2FycmF5JyxcbiAgICBkZWZhdWx0OiBbXSxcbiAgICBkZXNjcmlwdGlvbjogYEFkZCB0aGlzIGRpcmVjdG9yaWVzIHRvIFBBVEggd2hlbiBpbnZva2luZyBnaGMtbW9kLiBcXFxuWW91IG1pZ2h0IHdhbnQgdG8gYWRkIHBhdGggdG8gYSBkaXJlY3Rvcnkgd2l0aCBcXFxuZ2hjLCBjYWJhbCwgZXRjIGJpbmFyaWVzIGhlcmUuIFxcXG5TZXBhcmF0ZSB3aXRoIGNvbW1hLmAsXG4gICAgaXRlbXM6IHtcbiAgICAgIHR5cGU6ICdzdHJpbmcnLFxuICAgIH0sXG4gICAgb3JkZXI6IDAsXG4gIH0sXG4gIGNhYmFsU2FuZGJveDoge1xuICAgIHR5cGU6ICdib29sZWFuJyxcbiAgICBkZWZhdWx0OiB0cnVlLFxuICAgIGRlc2NyaXB0aW9uOiAnQWRkIGNhYmFsIHNhbmRib3ggYmluLXBhdGggdG8gUEFUSCcsXG4gICAgb3JkZXI6IDEwMCxcbiAgfSxcbiAgc3RhY2tTYW5kYm94OiB7XG4gICAgdHlwZTogJ2Jvb2xlYW4nLFxuICAgIGRlZmF1bHQ6IHRydWUsXG4gICAgZGVzY3JpcHRpb246ICdBZGQgc3RhY2sgYmluLXBhdGggdG8gUEFUSCcsXG4gICAgb3JkZXI6IDEwMCxcbiAgfSxcbiAgaW5pdFRpbWVvdXQ6IHtcbiAgICB0eXBlOiAnaW50ZWdlcicsXG4gICAgZGVzY3JpcHRpb246IGBIb3cgbG9uZyB0byB3YWl0IGZvciBpbml0aWFsaXphdGlvbiBjb21tYW5kcyAoY2hlY2tpbmcgXFxcbkdIQyBhbmQgZ2hjLW1vZCB2ZXJzaW9ucywgZ2V0dGluZyBzdGFjayBzYW5kYm94KSB1bnRpbCBcXFxuYXNzdW1pbmcgdGhvc2UgaGFuZ2VkIGFuZCBiYWlsaW5nLiBJbiBzZWNvbmRzLmAsXG4gICAgZGVmYXVsdDogNjAsXG4gICAgbWluaW11bTogMSxcbiAgICBvcmRlcjogNTAsXG4gIH0sXG4gIGludGVyYWN0aXZlSW5hY3Rpdml0eVRpbWVvdXQ6IHtcbiAgICB0eXBlOiAnaW50ZWdlcicsXG4gICAgZGVzY3JpcHRpb246IGBLaWxsIGdoYy1tb2QgaW50ZXJhY3RpdmUgcHJvY2VzcyAoZ2hjLW1vZGkpIGFmdGVyIHRoaXMgXFxcbm51bWJlciBvZiBtaW51dGVzIG9mIGluYWN0aXZpdHkgdG8gY29uc2VydmUgbWVtb3J5LiAwIFxcXG5tZWFucyBuZXZlci5gLFxuICAgIGRlZmF1bHQ6IDYwLFxuICAgIG1pbmltdW06IDAsXG4gICAgb3JkZXI6IDUwLFxuICB9LFxuICBpbnRlcmFjdGl2ZUFjdGlvblRpbWVvdXQ6IHtcbiAgICB0eXBlOiAnaW50ZWdlcicsXG4gICAgZGVzY3JpcHRpb246IGBUaW1lb3V0IGZvciBpbnRlcmFjdGl2ZSBnaGMtbW9kIGNvbW1hbmRzIChpbiBzZWNvbmRzKS4gMCBcXFxubWVhbnMgd2FpdCBmb3JldmVyLmAsXG4gICAgZGVmYXVsdDogMzAwLFxuICAgIG1pbmltdW06IDAsXG4gICAgb3JkZXI6IDUwLFxuICB9LFxuICBvblNhdmVDaGVjazoge1xuICAgIHR5cGU6ICdib29sZWFuJyxcbiAgICBkZWZhdWx0OiB0cnVlLFxuICAgIGRlc2NyaXB0aW9uOiAnQ2hlY2sgZmlsZSBvbiBzYXZlJyxcbiAgICBvcmRlcjogMjUsXG4gIH0sXG4gIG9uU2F2ZUxpbnQ6IHtcbiAgICB0eXBlOiAnYm9vbGVhbicsXG4gICAgZGVmYXVsdDogdHJ1ZSxcbiAgICBkZXNjcmlwdGlvbjogJ0xpbnQgZmlsZSBvbiBzYXZlJyxcbiAgICBvcmRlcjogMjUsXG4gIH0sXG4gIG9uQ2hhbmdlQ2hlY2s6IHtcbiAgICB0eXBlOiAnYm9vbGVhbicsXG4gICAgZGVmYXVsdDogZmFsc2UsXG4gICAgZGVzY3JpcHRpb246ICdDaGVjayBmaWxlIG9uIGNoYW5nZScsXG4gICAgb3JkZXI6IDI1LFxuICB9LFxuICBvbkNoYW5nZUxpbnQ6IHtcbiAgICB0eXBlOiAnYm9vbGVhbicsXG4gICAgZGVmYXVsdDogZmFsc2UsXG4gICAgZGVzY3JpcHRpb246ICdMaW50IGZpbGUgb24gY2hhbmdlJyxcbiAgICBvcmRlcjogMjUsXG4gIH0sXG4gIGFsd2F5c0ludGVyYWN0aXZlQ2hlY2s6IHtcbiAgICB0eXBlOiAnYm9vbGVhbicsXG4gICAgZGVmYXVsdDogdHJ1ZSxcbiAgICBkZXNjcmlwdGlvbjogYEFsd2F5cyB1c2UgaW50ZXJhY3RpdmUgbW9kZSBmb3IgY2hlY2suIE11Y2ggZmFzdGVyIG9uIGxhcmdlIFxcXG5wcm9qZWN0cywgYnV0IGNhbiBsZWFkIHRvIHByb2JsZW1zLiBUcnkgZGlzYWJsaW5nIGlmIGV4cGVyaWVuY2luZyBzbG93ZG93bnMgb3IgXFxcbmNyYXNoZXNgLFxuICAgIG9yZGVyOiAyNixcbiAgfSxcbiAgb25Nb3VzZUhvdmVyU2hvdzoge1xuICAgIHR5cGU6ICdzdHJpbmcnLFxuICAgIGRlc2NyaXB0aW9uOiAnQ29udGVudHMgb2YgdG9vbHRpcCBvbiBtb3VzZSBob3ZlcicsXG4gICAgZGVmYXVsdDogJ3R5cGVBbmRJbmZvJyxcbiAgICBlbnVtOiB0b29sdGlwQWN0aW9ucyxcbiAgICBvcmRlcjogMzAsXG4gIH0sXG4gIG9uU2VsZWN0aW9uU2hvdzoge1xuICAgIHR5cGU6ICdzdHJpbmcnLFxuICAgIGRlc2NyaXB0aW9uOiAnQ29udGVudHMgb2YgdG9vbHRpcCBvbiBzZWxlY3Rpb24nLFxuICAgIGRlZmF1bHQ6ICcnLFxuICAgIGVudW06IHRvb2x0aXBBY3Rpb25zLFxuICAgIG9yZGVyOiAzMCxcbiAgfSxcbiAgbWF4QnJvd3NlUHJvY2Vzc2VzOiB7XG4gICAgdHlwZTogJ2ludGVnZXInLFxuICAgIGRlZmF1bHQ6IDIsXG4gICAgZGVzY3JpcHRpb246IGBNYXhpbXVtIG51bWJlciBvZiBwYXJhbGxlbCBnaGMtbW9kIGJyb3dzZSBwcm9jZXNzZXMsIHdoaWNoIFxcXG5hcmUgdXNlZCBpbiBhdXRvY29tcGxldGlvbiBiYWNrZW5kIGluaXRpYWxpemF0aW9uLiBcXFxuTm90ZSB0aGF0IG9uIGxhcmdlciBwcm9qZWN0cyBpdCBtYXkgcmVxdWlyZSBhIGNvbnNpZGVyYWJsZSBcXFxuYW1vdW50IG9mIG1lbW9yeS5gLFxuICAgIG9yZGVyOiA2MCxcbiAgfSxcbiAgaGlnaGxpZ2h0VG9vbHRpcHM6IHtcbiAgICB0eXBlOiAnYm9vbGVhbicsXG4gICAgZGVmYXVsdDogdHJ1ZSxcbiAgICBkZXNjcmlwdGlvbjogJ1Nob3cgaGlnaGxpZ2h0aW5nIGZvciB0eXBlL2luZm8gdG9vbHRpcHMnLFxuICAgIG9yZGVyOiA0MCxcbiAgfSxcbiAgaGlnaGxpZ2h0TWVzc2FnZXM6IHtcbiAgICB0eXBlOiAnYm9vbGVhbicsXG4gICAgZGVmYXVsdDogdHJ1ZSxcbiAgICBkZXNjcmlwdGlvbjogJ1Nob3cgaGlnaGxpZ2h0aW5nIGZvciBvdXRwdXQgcGFuZWwgbWVzc2FnZXMnLFxuICAgIG9yZGVyOiA0MCxcbiAgfSxcbiAgaGxpbnRPcHRpb25zOiB7XG4gICAgdHlwZTogJ2FycmF5JyxcbiAgICBkZWZhdWx0OiBbXSxcbiAgICBkZXNjcmlwdGlvbjogJ0NvbW1hbmQgbGluZSBvcHRpb25zIHRvIHBhc3MgdG8gaGxpbnQgKGNvbW1hLXNlcGFyYXRlZCknLFxuICAgIG9yZGVyOiA0NSxcbiAgfSxcbiAgZXhwZXJpbWVudGFsOiB7XG4gICAgdHlwZTogJ2Jvb2xlYW4nLFxuICAgIGRlZmF1bHQ6IGZhbHNlLFxuICAgIGRlc2NyaXB0aW9uOiBgRW5hYmxlIGV4cGVyaW1lbnRhbCBmZWF0dXJlcywgd2hpY2ggYXJlIGV4cGVjdGVkIHRvIGxhbmQgaW4gXFxcbm5leHQgcmVsZWFzZSBvZiBnaGMtbW9kLiBFTkFCTEUgT05MWSBJRiBZT1UgS05PVyBXSEFUIFlPVSBcXFxuQVJFIERPSU5HYCxcbiAgICBvcmRlcjogOTk5LFxuICB9LFxuICBzdXBwcmVzc0doY1BhY2thZ2VQYXRoV2FybmluZzoge1xuICAgIHR5cGU6ICdib29sZWFuJyxcbiAgICBkZWZhdWx0OiBmYWxzZSxcbiAgICBkZXNjcmlwdGlvbjogYFN1cHByZXNzIHdhcm5pbmcgYWJvdXQgR0hDX1BBQ0tBR0VfUEFUSCBlbnZpcm9ubWVudCB2YXJpYWJsZS4gXFxcbkVOQUJMRSBPTkxZIElGIFlPVSBLTk9XIFdIQVQgWU9VIEFSRSBET0lORy5gLFxuICAgIG9yZGVyOiA5OTksXG4gIH0sXG4gIGdoY01vZE1lc3NhZ2VzOiB7XG4gICAgdHlwZTogJ3N0cmluZycsXG4gICAgZGVzY3JpcHRpb246ICdIb3cgdG8gc2hvdyB3YXJuaW5ncy9lcnJvcnMgcmVwb3J0ZWQgYnkgZ2hjLW1vZCAocmVxdWlyZXMgcmVzdGFydCknLFxuICAgIGRlZmF1bHQ6ICdjb25zb2xlJyxcbiAgICBlbnVtOiBbXG4gICAgICB7IHZhbHVlOiAnY29uc29sZScsIGRlc2NyaXB0aW9uOiAnRGV2ZWxvcGVyIENvbnNvbGUnIH0sXG4gICAgICB7IHZhbHVlOiAndXBpJywgZGVzY3JpcHRpb246ICdPdXRwdXQgUGFuZWwnIH0sXG4gICAgICB7IHZhbHVlOiAncG9wdXAnLCBkZXNjcmlwdGlvbjogJ0Vycm9yL1dhcm5pbmcgUG9wdXBzJyB9LFxuICAgIF0sXG4gICAgb3JkZXI6IDQyLFxuICB9LFxufVxuIl19