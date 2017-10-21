"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const atom_1 = require("atom");
const Util = require("../util");
function getSettings(runDir) {
    return __awaiter(this, void 0, void 0, function* () {
        const localSettings = readSettings(runDir.getFile('.haskell-ghc-mod.json'));
        const [projectDir] = atom.project.getDirectories().filter((d) => d.contains(runDir.getPath()));
        const projectSettings = projectDir ?
            readSettings(projectDir.getFile('.haskell-ghc-mod.json'))
            :
                Promise.resolve({});
        const configDir = new atom_1.Directory(atom.getConfigDirPath());
        const globalSettings = readSettings(configDir.getFile('haskell-ghc-mod.json'));
        const [glob, prj, loc] = yield Promise.all([globalSettings, projectSettings, localSettings]);
        return Object.assign({}, glob, prj, loc);
    });
}
exports.getSettings = getSettings;
function readSettings(file) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const ex = yield file.exists();
            if (ex) {
                const contents = yield file.read();
                try {
                    return JSON.parse(contents);
                }
                catch (err) {
                    atom.notifications.addError(`Failed to parse ${file.getPath()}`, {
                        detail: err,
                        dismissable: true,
                    });
                    throw err;
                }
            }
            else {
                return {};
            }
        }
        catch (error) {
            if (error) {
                Util.warn(error);
            }
            return {};
        }
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2V0dGluZ3MuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvZ2hjLW1vZC9zZXR0aW5ncy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7O0FBQUEsK0JBQWdDO0FBQ2hDLGdDQUErQjtBQVMvQixxQkFBa0MsTUFBMkI7O1FBQzNELE1BQU0sYUFBYSxHQUFHLFlBQVksQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLHVCQUF1QixDQUFDLENBQUMsQ0FBQTtRQUUzRSxNQUFNLENBQUMsVUFBVSxDQUFDLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxjQUFjLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQTtRQUM5RixNQUFNLGVBQWUsR0FDbkIsVUFBVSxDQUFDLENBQUM7WUFDVixZQUFZLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1lBQ3pELENBQUM7Z0JBQ0QsT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQTtRQUV2QixNQUFNLFNBQVMsR0FBRyxJQUFJLGdCQUFTLENBQUMsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUMsQ0FBQTtRQUN4RCxNQUFNLGNBQWMsR0FBRyxZQUFZLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDLENBQUE7UUFFOUUsTUFBTSxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLEdBQUcsTUFBTSxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsY0FBYyxFQUFFLGVBQWUsRUFBRSxhQUFhLENBQUMsQ0FBQyxDQUFBO1FBQzVGLE1BQU0sbUJBQU0sSUFBSSxFQUFLLEdBQUcsRUFBSyxHQUFHLEVBQUU7SUFDcEMsQ0FBQztDQUFBO0FBZkQsa0NBZUM7QUFFRCxzQkFBNEIsSUFBb0I7O1FBQzlDLElBQUksQ0FBQztZQUNILE1BQU0sRUFBRSxHQUFHLE1BQU0sSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFBO1lBQzlCLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBQ1AsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUE7Z0JBQ2xDLElBQUksQ0FBQztvQkFFSCxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQTtnQkFDN0IsQ0FBQztnQkFBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO29CQUNiLElBQUksQ0FBQyxhQUFhLENBQUMsUUFBUSxDQUFDLG1CQUFtQixJQUFJLENBQUMsT0FBTyxFQUFFLEVBQUUsRUFBRTt3QkFDL0QsTUFBTSxFQUFFLEdBQUc7d0JBQ1gsV0FBVyxFQUFFLElBQUk7cUJBQ2xCLENBQUMsQ0FBQTtvQkFDRixNQUFNLEdBQUcsQ0FBQTtnQkFDWCxDQUFDO1lBQ0gsQ0FBQztZQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNOLE1BQU0sQ0FBQyxFQUFFLENBQUE7WUFDWCxDQUFDO1FBQ0gsQ0FBQztRQUFDLEtBQUssQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFDZixFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO2dCQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUE7WUFBQyxDQUFDO1lBQy9CLE1BQU0sQ0FBQyxFQUFFLENBQUE7UUFDWCxDQUFDO0lBQ0gsQ0FBQztDQUFBIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgRGlyZWN0b3J5IH0gZnJvbSAnYXRvbSdcbmltcG9ydCAqIGFzIFV0aWwgZnJvbSAnLi4vdXRpbCdcblxuZXhwb3J0IGludGVyZmFjZSBHSENNb2RTZXR0aW5ncyB7XG4gIGRpc2FibGU/OiBib29sZWFuXG4gIHN1cHByZXNzRXJyb3JzPzogYm9vbGVhblxuICBnaGNPcHRpb25zPzogc3RyaW5nW11cbiAgZ2hjTW9kT3B0aW9ucz86IHN0cmluZ1tdXG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRTZXR0aW5ncyhydW5EaXI6IEF0b21UeXBlcy5EaXJlY3RvcnkpOiBQcm9taXNlPEdIQ01vZFNldHRpbmdzPiB7XG4gIGNvbnN0IGxvY2FsU2V0dGluZ3MgPSByZWFkU2V0dGluZ3MocnVuRGlyLmdldEZpbGUoJy5oYXNrZWxsLWdoYy1tb2QuanNvbicpKVxuXG4gIGNvbnN0IFtwcm9qZWN0RGlyXSA9IGF0b20ucHJvamVjdC5nZXREaXJlY3RvcmllcygpLmZpbHRlcigoZCkgPT4gZC5jb250YWlucyhydW5EaXIuZ2V0UGF0aCgpKSlcbiAgY29uc3QgcHJvamVjdFNldHRpbmdzID1cbiAgICBwcm9qZWN0RGlyID9cbiAgICAgIHJlYWRTZXR0aW5ncyhwcm9qZWN0RGlyLmdldEZpbGUoJy5oYXNrZWxsLWdoYy1tb2QuanNvbicpKVxuICAgICAgOlxuICAgICAgUHJvbWlzZS5yZXNvbHZlKHt9KVxuXG4gIGNvbnN0IGNvbmZpZ0RpciA9IG5ldyBEaXJlY3RvcnkoYXRvbS5nZXRDb25maWdEaXJQYXRoKCkpXG4gIGNvbnN0IGdsb2JhbFNldHRpbmdzID0gcmVhZFNldHRpbmdzKGNvbmZpZ0Rpci5nZXRGaWxlKCdoYXNrZWxsLWdoYy1tb2QuanNvbicpKVxuXG4gIGNvbnN0IFtnbG9iLCBwcmosIGxvY10gPSBhd2FpdCBQcm9taXNlLmFsbChbZ2xvYmFsU2V0dGluZ3MsIHByb2plY3RTZXR0aW5ncywgbG9jYWxTZXR0aW5nc10pXG4gIHJldHVybiB7IC4uLmdsb2IsIC4uLnByaiwgLi4ubG9jIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gcmVhZFNldHRpbmdzKGZpbGU6IEF0b21UeXBlcy5GaWxlKTogUHJvbWlzZTxHSENNb2RTZXR0aW5ncz4ge1xuICB0cnkge1xuICAgIGNvbnN0IGV4ID0gYXdhaXQgZmlsZS5leGlzdHMoKVxuICAgIGlmIChleCkge1xuICAgICAgY29uc3QgY29udGVudHMgPSBhd2FpdCBmaWxlLnJlYWQoKVxuICAgICAgdHJ5IHtcbiAgICAgICAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOm5vLXVuc2FmZS1hbnlcbiAgICAgICAgcmV0dXJuIEpTT04ucGFyc2UoY29udGVudHMpXG4gICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZEVycm9yKGBGYWlsZWQgdG8gcGFyc2UgJHtmaWxlLmdldFBhdGgoKX1gLCB7XG4gICAgICAgICAgZGV0YWlsOiBlcnIsXG4gICAgICAgICAgZGlzbWlzc2FibGU6IHRydWUsXG4gICAgICAgIH0pXG4gICAgICAgIHRocm93IGVyclxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4ge31cbiAgICB9XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgaWYgKGVycm9yKSB7IFV0aWwud2FybihlcnJvcikgfVxuICAgIHJldHVybiB7fVxuICB9XG59XG4iXX0=