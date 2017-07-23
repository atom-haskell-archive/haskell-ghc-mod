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
    }
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlnLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2NvbmZpZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLE1BQU0sY0FBYyxHQUNsQjtJQUNFLEVBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxXQUFXLEVBQUUsU0FBUyxFQUFDO0lBQ25DLEVBQUMsS0FBSyxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFDO0lBQ3BDLEVBQUMsS0FBSyxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFDO0lBQ3BDLEVBQUMsS0FBSyxFQUFFLFVBQVUsRUFBRSxXQUFXLEVBQUUsd0JBQXdCLEVBQUM7SUFDMUQsRUFBQyxLQUFLLEVBQUUsVUFBVSxFQUFFLFdBQVcsRUFBRSx3QkFBd0IsRUFBQztJQUMxRCxFQUFDLEtBQUssRUFBRSxhQUFhLEVBQUUsV0FBVyxFQUFFLGVBQWUsRUFBQztDQUNyRCxDQUFBO0FBRVUsUUFBQSxNQUFNLEdBQUc7SUFDcEIsVUFBVSxFQUFFO1FBQ1YsSUFBSSxFQUFFLFFBQVE7UUFDZCxPQUFPLEVBQUUsU0FBUztRQUNsQixXQUFXLEVBQUUsaUJBQWlCO1FBQzlCLEtBQUssRUFBRSxDQUFDO0tBQ1Q7SUFDRCxhQUFhLEVBQUU7UUFDYixJQUFJLEVBQUUsU0FBUztRQUNmLE9BQU8sRUFBRSxJQUFJO1FBQ2IsV0FBVyxFQUNUOytEQUN5RDtRQUMzRCxLQUFLLEVBQUUsRUFBRTtLQUNWO0lBQ0QsZUFBZSxFQUFFO1FBQ2YsSUFBSSxFQUFFLFNBQVM7UUFDZixPQUFPLEVBQUUsS0FBSztRQUNkLFdBQVcsRUFDVDtpREFDMkM7UUFDN0MsS0FBSyxFQUFFLEVBQUU7S0FDVjtJQUNELEtBQUssRUFBRTtRQUNMLElBQUksRUFBRSxTQUFTO1FBQ2YsT0FBTyxFQUFFLEtBQUs7UUFDZCxLQUFLLEVBQUUsR0FBRztLQUNYO0lBQ0QseUJBQXlCLEVBQUU7UUFDekIsSUFBSSxFQUFFLE9BQU87UUFDYixP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UztRQUNmLE9BQU8sRUFBRSxLQUFLO1FBQ2QsV0FBVyxFQUFFOztVQUVQO1FBQ04sS0FBSyxFQUFFLEdBQUc7S0FDWDtJQUNELDZCQUE2QixFQUFFO1FBQzdCLElBQUksRUFBRSxTQUFTO1FBQ2YsT0FBTyxFQUFFLEtBQUs7UUFDZCxXQUFXLEVBQUU7NENBQzJCO1FBQ3hDLEtBQUssRUFBRSxHQUFHO0tBQ1g7Q0FDRixDQUFBIiwic291cmNlc0NvbnRlbnQiOlsiY29uc3QgdG9vbHRpcEFjdGlvbnMgPVxuICBbXG4gICAge3ZhbHVlOiAnJywgZGVzY3JpcHRpb246ICdOb3RoaW5nJ30sXG4gICAge3ZhbHVlOiAndHlwZScsIGRlc2NyaXB0aW9uOiAnVHlwZSd9LFxuICAgIHt2YWx1ZTogJ2luZm8nLCBkZXNjcmlwdGlvbjogJ0luZm8nfSxcbiAgICB7dmFsdWU6ICdpbmZvVHlwZScsIGRlc2NyaXB0aW9uOiAnSW5mbywgZmFsbGJhY2sgdG8gVHlwZSd9LFxuICAgIHt2YWx1ZTogJ3R5cGVJbmZvJywgZGVzY3JpcHRpb246ICdUeXBlLCBmYWxsYmFjayB0byBJbmZvJ30sXG4gICAge3ZhbHVlOiAndHlwZUFuZEluZm8nLCBkZXNjcmlwdGlvbjogJ1R5cGUgYW5kIEluZm8nfVxuICBdXG5cbmV4cG9ydCBjb25zdCBjb25maWcgPSB7XG4gIGdoY01vZFBhdGg6IHtcbiAgICB0eXBlOiAnc3RyaW5nJyxcbiAgICBkZWZhdWx0OiAnZ2hjLW1vZCcsXG4gICAgZGVzY3JpcHRpb246ICdQYXRoIHRvIGdoYy1tb2QnLFxuICAgIG9yZGVyOiAwXG4gIH0sXG4gIGVuYWJsZUdoY01vZGk6IHtcbiAgICB0eXBlOiAnYm9vbGVhbicsXG4gICAgZGVmYXVsdDogdHJ1ZSxcbiAgICBkZXNjcmlwdGlvbjpcbiAgICAgIGBVc2luZyBHSEMgTW9kaSBpcyBzdWdnZXN0ZWQgYW5kIG5vdGljZWFibHkgZmFzdGVyLCBcXFxuYnV0IGlmIGV4cGVyaWVuY2luZyBwcm9ibGVtcywgZGlzYWJsaW5nIGl0IGNhbiBzb21ldGltZXMgaGVscC5gLFxuICAgIG9yZGVyOiA3MFxuICB9LFxuICBsb3dNZW1vcnlTeXN0ZW06IHtcbiAgICB0eXBlOiAnYm9vbGVhbicsXG4gICAgZGVmYXVsdDogZmFsc2UsXG4gICAgZGVzY3JpcHRpb246XG4gICAgICBgQXZvaWQgc3Bhd25pbmcgbW9yZSB0aGFuIG9uZSBnaGMtbW9kIHByb2Nlc3M7IGFsc28gZGlzYWJsZXMgcGFyYWxsZWwgXFxcbmZlYXR1cmVzLCB3aGljaCBjYW4gaGVscCB3aXRoIHdlaXJkIHN0YWNrIGVycm9yc2AsXG4gICAgb3JkZXI6IDcwXG4gIH0sXG4gIGRlYnVnOiB7XG4gICAgdHlwZTogJ2Jvb2xlYW4nLFxuICAgIGRlZmF1bHQ6IGZhbHNlLFxuICAgIG9yZGVyOiA5OTlcbiAgfSxcbiAgYWRkaXRpb25hbFBhdGhEaXJlY3Rvcmllczoge1xuICAgIHR5cGU6ICdhcnJheScsXG4gICAgZGVmYXVsdDogW10sXG4gICAgZGVzY3JpcHRpb246IGBBZGQgdGhpcyBkaXJlY3RvcmllcyB0byBQQVRIIHdoZW4gaW52b2tpbmcgZ2hjLW1vZC4gXFxcbllvdSBtaWdodCB3YW50IHRvIGFkZCBwYXRoIHRvIGEgZGlyZWN0b3J5IHdpdGggXFxcbmdoYywgY2FiYWwsIGV0YyBiaW5hcmllcyBoZXJlLiBcXFxuU2VwYXJhdGUgd2l0aCBjb21tYS5gLFxuICAgIGl0ZW1zOiB7XG4gICAgICB0eXBlOiAnc3RyaW5nJ1xuICAgIH0sXG4gICAgb3JkZXI6IDBcbiAgfSxcbiAgY2FiYWxTYW5kYm94OiB7XG4gICAgdHlwZTogJ2Jvb2xlYW4nLFxuICAgIGRlZmF1bHQ6IHRydWUsXG4gICAgZGVzY3JpcHRpb246ICdBZGQgY2FiYWwgc2FuZGJveCBiaW4tcGF0aCB0byBQQVRIJyxcbiAgICBvcmRlcjogMTAwXG4gIH0sXG4gIHN0YWNrU2FuZGJveDoge1xuICAgIHR5cGU6ICdib29sZWFuJyxcbiAgICBkZWZhdWx0OiB0cnVlLFxuICAgIGRlc2NyaXB0aW9uOiAnQWRkIHN0YWNrIGJpbi1wYXRoIHRvIFBBVEgnLFxuICAgIG9yZGVyOiAxMDBcbiAgfSxcbiAgaW5pdFRpbWVvdXQ6IHtcbiAgICB0eXBlOiAnaW50ZWdlcicsXG4gICAgZGVzY3JpcHRpb246IGBIb3cgbG9uZyB0byB3YWl0IGZvciBpbml0aWFsaXphdGlvbiBjb21tYW5kcyAoY2hlY2tpbmcgXFxcbkdIQyBhbmQgZ2hjLW1vZCB2ZXJzaW9ucywgZ2V0dGluZyBzdGFjayBzYW5kYm94KSB1bnRpbCBcXFxuYXNzdW1pbmcgdGhvc2UgaGFuZ2VkIGFuZCBiYWlsaW5nLiBJbiBzZWNvbmRzLmAsXG4gICAgZGVmYXVsdDogNjAsXG4gICAgbWluaW11bTogMSxcbiAgICBvcmRlcjogNTBcbiAgfSxcbiAgaW50ZXJhY3RpdmVJbmFjdGl2aXR5VGltZW91dDoge1xuICAgIHR5cGU6ICdpbnRlZ2VyJyxcbiAgICBkZXNjcmlwdGlvbjogYEtpbGwgZ2hjLW1vZCBpbnRlcmFjdGl2ZSBwcm9jZXNzIChnaGMtbW9kaSkgYWZ0ZXIgdGhpcyBcXFxubnVtYmVyIG9mIG1pbnV0ZXMgb2YgaW5hY3Rpdml0eSB0byBjb25zZXJ2ZSBtZW1vcnkuIDAgXFxcbm1lYW5zIG5ldmVyLmAsXG4gICAgZGVmYXVsdDogNjAsXG4gICAgbWluaW11bTogMCxcbiAgICBvcmRlcjogNTBcbiAgfSxcbiAgaW50ZXJhY3RpdmVBY3Rpb25UaW1lb3V0OiB7XG4gICAgdHlwZTogJ2ludGVnZXInLFxuICAgIGRlc2NyaXB0aW9uOiBgVGltZW91dCBmb3IgaW50ZXJhY3RpdmUgZ2hjLW1vZCBjb21tYW5kcyAoaW4gc2Vjb25kcykuIDAgXFxcbm1lYW5zIHdhaXQgZm9yZXZlci5gLFxuICAgIGRlZmF1bHQ6IDMwMCxcbiAgICBtaW5pbXVtOiAwLFxuICAgIG9yZGVyOiA1MFxuICB9LFxuICBvblNhdmVDaGVjazoge1xuICAgIHR5cGU6ICdib29sZWFuJyxcbiAgICBkZWZhdWx0OiB0cnVlLFxuICAgIGRlc2NyaXB0aW9uOiAnQ2hlY2sgZmlsZSBvbiBzYXZlJyxcbiAgICBvcmRlcjogMjVcbiAgfSxcbiAgb25TYXZlTGludDoge1xuICAgIHR5cGU6ICdib29sZWFuJyxcbiAgICBkZWZhdWx0OiB0cnVlLFxuICAgIGRlc2NyaXB0aW9uOiAnTGludCBmaWxlIG9uIHNhdmUnLFxuICAgIG9yZGVyOiAyNVxuICB9LFxuICBvbkNoYW5nZUNoZWNrOiB7XG4gICAgdHlwZTogJ2Jvb2xlYW4nLFxuICAgIGRlZmF1bHQ6IGZhbHNlLFxuICAgIGRlc2NyaXB0aW9uOiAnQ2hlY2sgZmlsZSBvbiBjaGFuZ2UnLFxuICAgIG9yZGVyOiAyNVxuICB9LFxuICBvbkNoYW5nZUxpbnQ6IHtcbiAgICB0eXBlOiAnYm9vbGVhbicsXG4gICAgZGVmYXVsdDogZmFsc2UsXG4gICAgZGVzY3JpcHRpb246ICdMaW50IGZpbGUgb24gY2hhbmdlJyxcbiAgICBvcmRlcjogMjVcbiAgfSxcbiAgb25Nb3VzZUhvdmVyU2hvdzoge1xuICAgIHR5cGU6ICdzdHJpbmcnLFxuICAgIGRlc2NyaXB0aW9uOiAnQ29udGVudHMgb2YgdG9vbHRpcCBvbiBtb3VzZSBob3ZlcicsXG4gICAgZGVmYXVsdDogJ3R5cGVBbmRJbmZvJyxcbiAgICBlbnVtOiB0b29sdGlwQWN0aW9ucyxcbiAgICBvcmRlcjogMzBcbiAgfSxcbiAgb25TZWxlY3Rpb25TaG93OiB7XG4gICAgdHlwZTogJ3N0cmluZycsXG4gICAgZGVzY3JpcHRpb246ICdDb250ZW50cyBvZiB0b29sdGlwIG9uIHNlbGVjdGlvbicsXG4gICAgZGVmYXVsdDogJycsXG4gICAgZW51bTogdG9vbHRpcEFjdGlvbnMsXG4gICAgb3JkZXI6IDMwXG4gIH0sXG4gIG1heEJyb3dzZVByb2Nlc3Nlczoge1xuICAgIHR5cGU6ICdpbnRlZ2VyJyxcbiAgICBkZWZhdWx0OiAyLFxuICAgIGRlc2NyaXB0aW9uOiBgTWF4aW11bSBudW1iZXIgb2YgcGFyYWxsZWwgZ2hjLW1vZCBicm93c2UgcHJvY2Vzc2VzLCB3aGljaCBcXFxuYXJlIHVzZWQgaW4gYXV0b2NvbXBsZXRpb24gYmFja2VuZCBpbml0aWFsaXphdGlvbi4gXFxcbk5vdGUgdGhhdCBvbiBsYXJnZXIgcHJvamVjdHMgaXQgbWF5IHJlcXVpcmUgYSBjb25zaWRlcmFibGUgXFxcbmFtb3VudCBvZiBtZW1vcnkuYCxcbiAgICBvcmRlcjogNjBcbiAgfSxcbiAgaGlnaGxpZ2h0VG9vbHRpcHM6IHtcbiAgICB0eXBlOiAnYm9vbGVhbicsXG4gICAgZGVmYXVsdDogdHJ1ZSxcbiAgICBkZXNjcmlwdGlvbjogJ1Nob3cgaGlnaGxpZ2h0aW5nIGZvciB0eXBlL2luZm8gdG9vbHRpcHMnLFxuICAgIG9yZGVyOiA0MFxuICB9LFxuICBoaWdobGlnaHRNZXNzYWdlczoge1xuICAgIHR5cGU6ICdib29sZWFuJyxcbiAgICBkZWZhdWx0OiB0cnVlLFxuICAgIGRlc2NyaXB0aW9uOiAnU2hvdyBoaWdobGlnaHRpbmcgZm9yIG91dHB1dCBwYW5lbCBtZXNzYWdlcycsXG4gICAgb3JkZXI6IDQwXG4gIH0sXG4gIGhsaW50T3B0aW9uczoge1xuICAgIHR5cGU6ICdhcnJheScsXG4gICAgZGVmYXVsdDogW10sXG4gICAgZGVzY3JpcHRpb246ICdDb21tYW5kIGxpbmUgb3B0aW9ucyB0byBwYXNzIHRvIGhsaW50IChjb21tYS1zZXBhcmF0ZWQpJyxcbiAgICBvcmRlcjogNDVcbiAgfSxcbiAgZXhwZXJpbWVudGFsOiB7XG4gICAgdHlwZTogJ2Jvb2xlYW4nLFxuICAgIGRlZmF1bHQ6IGZhbHNlLFxuICAgIGRlc2NyaXB0aW9uOiBgRW5hYmxlIGV4cGVyaW1lbnRhbCBmZWF0dXJlcywgd2hpY2ggYXJlIGV4cGVjdGVkIHRvIGxhbmQgaW4gXFxcbm5leHQgcmVsZWFzZSBvZiBnaGMtbW9kLiBFTkFCTEUgT05MWSBJRiBZT1UgS05PVyBXSEFUIFlPVSBcXFxuQVJFIERPSU5HYCxcbiAgICBvcmRlcjogOTk5XG4gIH0sXG4gIHN1cHByZXNzR2hjUGFja2FnZVBhdGhXYXJuaW5nOiB7XG4gICAgdHlwZTogJ2Jvb2xlYW4nLFxuICAgIGRlZmF1bHQ6IGZhbHNlLFxuICAgIGRlc2NyaXB0aW9uOiBgU3VwcHJlc3Mgd2FybmluZyBhYm91dCBHSENfUEFDS0FHRV9QQVRIIGVudmlyb25tZW50IHZhcmlhYmxlLiBcXFxuRU5BQkxFIE9OTFkgSUYgWU9VIEtOT1cgV0hBVCBZT1UgQVJFIERPSU5HLmAsXG4gICAgb3JkZXI6IDk5OVxuICB9XG59XG4iXX0=