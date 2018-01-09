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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlnLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2NvbmZpZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLE1BQU0sY0FBYyxHQUFHO0lBQ3JCLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRSxXQUFXLEVBQUUsU0FBUyxFQUFFO0lBQ3JDLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFFO0lBQ3RDLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFFO0lBQ3RDLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRSxXQUFXLEVBQUUsd0JBQXdCLEVBQUU7SUFDNUQsRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFLFdBQVcsRUFBRSx3QkFBd0IsRUFBRTtJQUM1RCxFQUFFLEtBQUssRUFBRSxhQUFhLEVBQUUsV0FBVyxFQUFFLGVBQWUsRUFBRTtDQUN2RCxDQUFBO0FBRVksUUFBQSxNQUFNLEdBQUc7SUFDcEIsVUFBVSxFQUFFO1FBQ1YsSUFBSSxFQUFFLFFBQVE7UUFDZCxPQUFPLEVBQUUsU0FBUztRQUNsQixXQUFXLEVBQUUsaUJBQWlCO1FBQzlCLEtBQUssRUFBRSxDQUFDO0tBQ1Q7SUFDRCxhQUFhLEVBQUU7UUFDYixJQUFJLEVBQUUsU0FBUztRQUNmLE9BQU8sRUFBRSxJQUFJO1FBQ2IsV0FBVyxFQUFFOytEQUM4QztRQUMzRCxLQUFLLEVBQUUsRUFBRTtLQUNWO0lBQ0QsZUFBZSxFQUFFO1FBQ2YsSUFBSSxFQUFFLFNBQVM7UUFDZixPQUFPLEVBQUUsS0FBSztRQUNkLFdBQVcsRUFBRTtpREFDZ0M7UUFDN0MsS0FBSyxFQUFFLEVBQUU7S0FDVjtJQUNELEtBQUssRUFBRTtRQUNMLElBQUksRUFBRSxTQUFTO1FBQ2YsT0FBTyxFQUFFLEtBQUs7UUFDZCxLQUFLLEVBQUUsR0FBRztLQUNYO0lBQ0QsaUJBQWlCLEVBQUU7UUFDakIsSUFBSSxFQUFFLFNBQVM7UUFDZixX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QUNWO0NBQ0YsQ0FBQSIsInNvdXJjZXNDb250ZW50IjpbImNvbnN0IHRvb2x0aXBBY3Rpb25zID0gW1xuICB7IHZhbHVlOiAnJywgZGVzY3JpcHRpb246ICdOb3RoaW5nJyB9LFxuICB7IHZhbHVlOiAndHlwZScsIGRlc2NyaXB0aW9uOiAnVHlwZScgfSxcbiAgeyB2YWx1ZTogJ2luZm8nLCBkZXNjcmlwdGlvbjogJ0luZm8nIH0sXG4gIHsgdmFsdWU6ICdpbmZvVHlwZScsIGRlc2NyaXB0aW9uOiAnSW5mbywgZmFsbGJhY2sgdG8gVHlwZScgfSxcbiAgeyB2YWx1ZTogJ3R5cGVJbmZvJywgZGVzY3JpcHRpb246ICdUeXBlLCBmYWxsYmFjayB0byBJbmZvJyB9LFxuICB7IHZhbHVlOiAndHlwZUFuZEluZm8nLCBkZXNjcmlwdGlvbjogJ1R5cGUgYW5kIEluZm8nIH0sXG5dXG5cbmV4cG9ydCBjb25zdCBjb25maWcgPSB7XG4gIGdoY01vZFBhdGg6IHtcbiAgICB0eXBlOiAnc3RyaW5nJyxcbiAgICBkZWZhdWx0OiAnZ2hjLW1vZCcsXG4gICAgZGVzY3JpcHRpb246ICdQYXRoIHRvIGdoYy1tb2QnLFxuICAgIG9yZGVyOiAwLFxuICB9LFxuICBlbmFibGVHaGNNb2RpOiB7XG4gICAgdHlwZTogJ2Jvb2xlYW4nLFxuICAgIGRlZmF1bHQ6IHRydWUsXG4gICAgZGVzY3JpcHRpb246IGBVc2luZyBHSEMgTW9kaSBpcyBzdWdnZXN0ZWQgYW5kIG5vdGljZWFibHkgZmFzdGVyLCBcXFxuYnV0IGlmIGV4cGVyaWVuY2luZyBwcm9ibGVtcywgZGlzYWJsaW5nIGl0IGNhbiBzb21ldGltZXMgaGVscC5gLFxuICAgIG9yZGVyOiA3MCxcbiAgfSxcbiAgbG93TWVtb3J5U3lzdGVtOiB7XG4gICAgdHlwZTogJ2Jvb2xlYW4nLFxuICAgIGRlZmF1bHQ6IGZhbHNlLFxuICAgIGRlc2NyaXB0aW9uOiBgQXZvaWQgc3Bhd25pbmcgbW9yZSB0aGFuIG9uZSBnaGMtbW9kIHByb2Nlc3M7IGFsc28gZGlzYWJsZXMgcGFyYWxsZWwgXFxcbmZlYXR1cmVzLCB3aGljaCBjYW4gaGVscCB3aXRoIHdlaXJkIHN0YWNrIGVycm9yc2AsXG4gICAgb3JkZXI6IDcwLFxuICB9LFxuICBkZWJ1Zzoge1xuICAgIHR5cGU6ICdib29sZWFuJyxcbiAgICBkZWZhdWx0OiBmYWxzZSxcbiAgICBvcmRlcjogOTk5LFxuICB9LFxuICBidWlsZGVyTWFuYWdlbWVudDoge1xuICAgIHR5cGU6ICdib29sZWFuJyxcbiAgICBkZXNjcmlwdGlvbjogYEV4cGVyaW1lbnRhbCBvcHRpb24gdG8gZm9yY2UgZ2hjLW1vZCBpbnRvIHVzaW5nIGNhYmFsIG9yIFxcXG5zdGFjayBiYXNlZCBvbiBpZGUtaGFza2VsbC1jYWJhbCBzZXR0aW5nczsgYWxzbyBlbmFibGVzIGFuIG9wdGlvbiB0byBidWlsZCBcXFxuZ2hjLW1vZCB3aGVuIHVzaW5nIHN0YWNrYCxcbiAgICBkZWZhdWx0OiBmYWxzZSxcbiAgICBvcmRlcjogOTAwLFxuICB9LFxuICBhZGRpdGlvbmFsUGF0aERpcmVjdG9yaWVzOiB7XG4gICAgdHlwZTogJ2FycmF5JyxcbiAgICBkZWZhdWx0OiBbXSxcbiAgICBkZXNjcmlwdGlvbjogYEFkZCB0aGlzIGRpcmVjdG9yaWVzIHRvIFBBVEggd2hlbiBpbnZva2luZyBnaGMtbW9kLiBcXFxuWW91IG1pZ2h0IHdhbnQgdG8gYWRkIHBhdGggdG8gYSBkaXJlY3Rvcnkgd2l0aCBcXFxuZ2hjLCBjYWJhbCwgZXRjIGJpbmFyaWVzIGhlcmUuIFxcXG5TZXBhcmF0ZSB3aXRoIGNvbW1hLmAsXG4gICAgaXRlbXM6IHtcbiAgICAgIHR5cGU6ICdzdHJpbmcnLFxuICAgIH0sXG4gICAgb3JkZXI6IDAsXG4gIH0sXG4gIGNhYmFsU2FuZGJveDoge1xuICAgIHR5cGU6ICdib29sZWFuJyxcbiAgICBkZWZhdWx0OiB0cnVlLFxuICAgIGRlc2NyaXB0aW9uOiAnQWRkIGNhYmFsIHNhbmRib3ggYmluLXBhdGggdG8gUEFUSCcsXG4gICAgb3JkZXI6IDEwMCxcbiAgfSxcbiAgc3RhY2tTYW5kYm94OiB7XG4gICAgdHlwZTogJ2Jvb2xlYW4nLFxuICAgIGRlZmF1bHQ6IHRydWUsXG4gICAgZGVzY3JpcHRpb246ICdBZGQgc3RhY2sgYmluLXBhdGggdG8gUEFUSCcsXG4gICAgb3JkZXI6IDEwMCxcbiAgfSxcbiAgaW5pdFRpbWVvdXQ6IHtcbiAgICB0eXBlOiAnaW50ZWdlcicsXG4gICAgZGVzY3JpcHRpb246IGBIb3cgbG9uZyB0byB3YWl0IGZvciBpbml0aWFsaXphdGlvbiBjb21tYW5kcyAoY2hlY2tpbmcgXFxcbkdIQyBhbmQgZ2hjLW1vZCB2ZXJzaW9ucywgZ2V0dGluZyBzdGFjayBzYW5kYm94KSB1bnRpbCBcXFxuYXNzdW1pbmcgdGhvc2UgaGFuZ2VkIGFuZCBiYWlsaW5nLiBJbiBzZWNvbmRzLmAsXG4gICAgZGVmYXVsdDogNjAsXG4gICAgbWluaW11bTogMSxcbiAgICBvcmRlcjogNTAsXG4gIH0sXG4gIGludGVyYWN0aXZlSW5hY3Rpdml0eVRpbWVvdXQ6IHtcbiAgICB0eXBlOiAnaW50ZWdlcicsXG4gICAgZGVzY3JpcHRpb246IGBLaWxsIGdoYy1tb2QgaW50ZXJhY3RpdmUgcHJvY2VzcyAoZ2hjLW1vZGkpIGFmdGVyIHRoaXMgXFxcbm51bWJlciBvZiBtaW51dGVzIG9mIGluYWN0aXZpdHkgdG8gY29uc2VydmUgbWVtb3J5LiAwIFxcXG5tZWFucyBuZXZlci5gLFxuICAgIGRlZmF1bHQ6IDYwLFxuICAgIG1pbmltdW06IDAsXG4gICAgb3JkZXI6IDUwLFxuICB9LFxuICBpbnRlcmFjdGl2ZUFjdGlvblRpbWVvdXQ6IHtcbiAgICB0eXBlOiAnaW50ZWdlcicsXG4gICAgZGVzY3JpcHRpb246IGBUaW1lb3V0IGZvciBpbnRlcmFjdGl2ZSBnaGMtbW9kIGNvbW1hbmRzIChpbiBzZWNvbmRzKS4gMCBcXFxubWVhbnMgd2FpdCBmb3JldmVyLmAsXG4gICAgZGVmYXVsdDogMzAwLFxuICAgIG1pbmltdW06IDAsXG4gICAgb3JkZXI6IDUwLFxuICB9LFxuICBvblNhdmVDaGVjazoge1xuICAgIHR5cGU6ICdib29sZWFuJyxcbiAgICBkZWZhdWx0OiB0cnVlLFxuICAgIGRlc2NyaXB0aW9uOiAnQ2hlY2sgZmlsZSBvbiBzYXZlJyxcbiAgICBvcmRlcjogMjUsXG4gIH0sXG4gIG9uU2F2ZUxpbnQ6IHtcbiAgICB0eXBlOiAnYm9vbGVhbicsXG4gICAgZGVmYXVsdDogdHJ1ZSxcbiAgICBkZXNjcmlwdGlvbjogJ0xpbnQgZmlsZSBvbiBzYXZlJyxcbiAgICBvcmRlcjogMjUsXG4gIH0sXG4gIG9uQ2hhbmdlQ2hlY2s6IHtcbiAgICB0eXBlOiAnYm9vbGVhbicsXG4gICAgZGVmYXVsdDogZmFsc2UsXG4gICAgZGVzY3JpcHRpb246ICdDaGVjayBmaWxlIG9uIGNoYW5nZScsXG4gICAgb3JkZXI6IDI1LFxuICB9LFxuICBvbkNoYW5nZUxpbnQ6IHtcbiAgICB0eXBlOiAnYm9vbGVhbicsXG4gICAgZGVmYXVsdDogZmFsc2UsXG4gICAgZGVzY3JpcHRpb246ICdMaW50IGZpbGUgb24gY2hhbmdlJyxcbiAgICBvcmRlcjogMjUsXG4gIH0sXG4gIGFsd2F5c0ludGVyYWN0aXZlQ2hlY2s6IHtcbiAgICB0eXBlOiAnYm9vbGVhbicsXG4gICAgZGVmYXVsdDogdHJ1ZSxcbiAgICBkZXNjcmlwdGlvbjogYEFsd2F5cyB1c2UgaW50ZXJhY3RpdmUgbW9kZSBmb3IgY2hlY2suIE11Y2ggZmFzdGVyIG9uIGxhcmdlIFxcXG5wcm9qZWN0cywgYnV0IGNhbiBsZWFkIHRvIHByb2JsZW1zLiBUcnkgZGlzYWJsaW5nIGlmIGV4cGVyaWVuY2luZyBzbG93ZG93bnMgb3IgXFxcbmNyYXNoZXNgLFxuICAgIG9yZGVyOiAyNixcbiAgfSxcbiAgb25Nb3VzZUhvdmVyU2hvdzoge1xuICAgIHR5cGU6ICdzdHJpbmcnLFxuICAgIGRlc2NyaXB0aW9uOiAnQ29udGVudHMgb2YgdG9vbHRpcCBvbiBtb3VzZSBob3ZlcicsXG4gICAgZGVmYXVsdDogJ3R5cGVBbmRJbmZvJyxcbiAgICBlbnVtOiB0b29sdGlwQWN0aW9ucyxcbiAgICBvcmRlcjogMzAsXG4gIH0sXG4gIG9uU2VsZWN0aW9uU2hvdzoge1xuICAgIHR5cGU6ICdzdHJpbmcnLFxuICAgIGRlc2NyaXB0aW9uOiAnQ29udGVudHMgb2YgdG9vbHRpcCBvbiBzZWxlY3Rpb24nLFxuICAgIGRlZmF1bHQ6ICcnLFxuICAgIGVudW06IHRvb2x0aXBBY3Rpb25zLFxuICAgIG9yZGVyOiAzMCxcbiAgfSxcbiAgbWF4QnJvd3NlUHJvY2Vzc2VzOiB7XG4gICAgdHlwZTogJ2ludGVnZXInLFxuICAgIGRlZmF1bHQ6IDIsXG4gICAgZGVzY3JpcHRpb246IGBNYXhpbXVtIG51bWJlciBvZiBwYXJhbGxlbCBnaGMtbW9kIGJyb3dzZSBwcm9jZXNzZXMsIHdoaWNoIFxcXG5hcmUgdXNlZCBpbiBhdXRvY29tcGxldGlvbiBiYWNrZW5kIGluaXRpYWxpemF0aW9uLiBcXFxuTm90ZSB0aGF0IG9uIGxhcmdlciBwcm9qZWN0cyBpdCBtYXkgcmVxdWlyZSBhIGNvbnNpZGVyYWJsZSBcXFxuYW1vdW50IG9mIG1lbW9yeS5gLFxuICAgIG9yZGVyOiA2MCxcbiAgfSxcbiAgaGlnaGxpZ2h0VG9vbHRpcHM6IHtcbiAgICB0eXBlOiAnYm9vbGVhbicsXG4gICAgZGVmYXVsdDogdHJ1ZSxcbiAgICBkZXNjcmlwdGlvbjogJ1Nob3cgaGlnaGxpZ2h0aW5nIGZvciB0eXBlL2luZm8gdG9vbHRpcHMnLFxuICAgIG9yZGVyOiA0MCxcbiAgfSxcbiAgc3VwcHJlc3NSZWR1bmRhbnRUeXBlSW5UeXBlQW5kSW5mb1Rvb2x0aXBzOiB7XG4gICAgdHlwZTogJ2Jvb2xlYW4nLFxuICAgIGRlZmF1bHQ6IHRydWUsXG4gICAgZGVzY3JpcHRpb246IGBJbiB0b29sdGlwcyB3aXRoIHR5cGUgQU5EIGluZm8sIHN1cHByZXNzIHR5cGUgaWYgXFxcbml0J3MgdGhlIHNhbWUgYXMgaW5mb2AsXG4gICAgb3JkZXI6IDQxLFxuICB9LFxuICBoaWdobGlnaHRNZXNzYWdlczoge1xuICAgIHR5cGU6ICdib29sZWFuJyxcbiAgICBkZWZhdWx0OiB0cnVlLFxuICAgIGRlc2NyaXB0aW9uOiAnU2hvdyBoaWdobGlnaHRpbmcgZm9yIG91dHB1dCBwYW5lbCBtZXNzYWdlcycsXG4gICAgb3JkZXI6IDQwLFxuICB9LFxuICBobGludE9wdGlvbnM6IHtcbiAgICB0eXBlOiAnYXJyYXknLFxuICAgIGRlZmF1bHQ6IFtdLFxuICAgIGRlc2NyaXB0aW9uOiAnQ29tbWFuZCBsaW5lIG9wdGlvbnMgdG8gcGFzcyB0byBobGludCAoY29tbWEtc2VwYXJhdGVkKScsXG4gICAgb3JkZXI6IDQ1LFxuICB9LFxuICBleHBlcmltZW50YWw6IHtcbiAgICB0eXBlOiAnYm9vbGVhbicsXG4gICAgZGVmYXVsdDogZmFsc2UsXG4gICAgZGVzY3JpcHRpb246IGBFbmFibGUgZXhwZXJpbWVudGFsIGZlYXR1cmVzLCB3aGljaCBhcmUgZXhwZWN0ZWQgdG8gbGFuZCBpbiBcXFxubmV4dCByZWxlYXNlIG9mIGdoYy1tb2QuIEVOQUJMRSBPTkxZIElGIFlPVSBLTk9XIFdIQVQgWU9VIFxcXG5BUkUgRE9JTkdgLFxuICAgIG9yZGVyOiA5OTksXG4gIH0sXG4gIHN1cHByZXNzR2hjUGFja2FnZVBhdGhXYXJuaW5nOiB7XG4gICAgdHlwZTogJ2Jvb2xlYW4nLFxuICAgIGRlZmF1bHQ6IGZhbHNlLFxuICAgIGRlc2NyaXB0aW9uOiBgU3VwcHJlc3Mgd2FybmluZyBhYm91dCBHSENfUEFDS0FHRV9QQVRIIGVudmlyb25tZW50IHZhcmlhYmxlLiBcXFxuRU5BQkxFIE9OTFkgSUYgWU9VIEtOT1cgV0hBVCBZT1UgQVJFIERPSU5HLmAsXG4gICAgb3JkZXI6IDk5OSxcbiAgfSxcbiAgZ2hjTW9kTWVzc2FnZXM6IHtcbiAgICB0eXBlOiAnc3RyaW5nJyxcbiAgICBkZXNjcmlwdGlvbjpcbiAgICAgICdIb3cgdG8gc2hvdyB3YXJuaW5ncy9lcnJvcnMgcmVwb3J0ZWQgYnkgZ2hjLW1vZCAocmVxdWlyZXMgcmVzdGFydCknLFxuICAgIGRlZmF1bHQ6ICdjb25zb2xlJyxcbiAgICBlbnVtOiBbXG4gICAgICB7IHZhbHVlOiAnY29uc29sZScsIGRlc2NyaXB0aW9uOiAnRGV2ZWxvcGVyIENvbnNvbGUnIH0sXG4gICAgICB7IHZhbHVlOiAndXBpJywgZGVzY3JpcHRpb246ICdPdXRwdXQgUGFuZWwnIH0sXG4gICAgICB7IHZhbHVlOiAncG9wdXAnLCBkZXNjcmlwdGlvbjogJ0Vycm9yL1dhcm5pbmcgUG9wdXBzJyB9LFxuICAgIF0sXG4gICAgb3JkZXI6IDQyLFxuICB9LFxuICBtYXhNZW1NZWdzOiB7XG4gICAgdHlwZTogJ2ludGVnZXInLFxuICAgIGRlc2NyaXRpb246ICdNYXhpbXVtIGdoYy1tb2QgaW50ZXJhY3RpdmUgbW9kZSBtZW1vcnkgdXNhZ2UgKGluIG1lZ2FieXRlcyknLFxuICAgIGRlZmF1bHQ6IDQgKiAxMDI0LFxuICAgIG1pbmltdW06IDEwMjQsXG4gICAgb3JkZXI6IDUwLFxuICB9LFxufVxuIl19