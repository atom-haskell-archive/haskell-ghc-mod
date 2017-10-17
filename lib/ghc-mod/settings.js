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
        const readSettings = (file) => __awaiter(this, void 0, void 0, function* () {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2V0dGluZ3MuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvZ2hjLW1vZC9zZXR0aW5ncy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7O0FBQUEsK0JBQWdDO0FBQ2hDLGdDQUErQjtBQUUvQixxQkFBa0MsTUFBMkI7O1FBQzNELE1BQU0sWUFBWSxHQUFHLENBQU8sSUFBb0IsRUFBRSxFQUFFO1lBQ2xELElBQUksQ0FBQztnQkFDSCxNQUFNLEVBQUUsR0FBRyxNQUFNLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQTtnQkFDOUIsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztvQkFDUCxNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQTtvQkFDbEMsSUFBSSxDQUFDO3dCQUNILE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFBO29CQUM3QixDQUFDO29CQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7d0JBQ2IsSUFBSSxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsbUJBQW1CLElBQUksQ0FBQyxPQUFPLEVBQUUsRUFBRSxFQUFFOzRCQUMvRCxNQUFNLEVBQUUsR0FBRzs0QkFDWCxXQUFXLEVBQUUsSUFBSTt5QkFDbEIsQ0FBQyxDQUFBO3dCQUNGLE1BQU0sR0FBRyxDQUFBO29CQUNYLENBQUM7Z0JBQ0gsQ0FBQztnQkFBQyxJQUFJLENBQUMsQ0FBQztvQkFDTixNQUFNLENBQUMsRUFBRSxDQUFBO2dCQUNYLENBQUM7WUFDSCxDQUFDO1lBQUMsS0FBSyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztnQkFDZixFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO29CQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUE7Z0JBQUMsQ0FBQztnQkFDL0IsTUFBTSxDQUFDLEVBQUUsQ0FBQTtZQUNYLENBQUM7UUFDSCxDQUFDLENBQUEsQ0FBQTtRQUVELE1BQU0sYUFBYSxHQUFHLFlBQVksQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLHVCQUF1QixDQUFDLENBQUMsQ0FBQTtRQUUzRSxNQUFNLENBQUMsVUFBVSxDQUFDLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxjQUFjLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQTtRQUM5RixNQUFNLGVBQWUsR0FDbkIsVUFBVSxDQUFDLENBQUM7WUFDVixZQUFZLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1lBQ3pELENBQUM7Z0JBQ0QsT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQTtRQUV2QixNQUFNLFNBQVMsR0FBRyxJQUFJLGdCQUFTLENBQUMsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUMsQ0FBQTtRQUN4RCxNQUFNLGNBQWMsR0FBRyxZQUFZLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDLENBQUE7UUFFOUUsTUFBTSxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLEdBQUcsTUFBTSxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsY0FBYyxFQUFFLGVBQWUsRUFBRSxhQUFhLENBQUMsQ0FBQyxDQUFBO1FBQzVGLE1BQU0sbUJBQU0sSUFBSSxFQUFLLEdBQUcsRUFBSyxHQUFHLEVBQUU7SUFDcEMsQ0FBQztDQUFBO0FBdENELGtDQXNDQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IERpcmVjdG9yeSB9IGZyb20gJ2F0b20nXG5pbXBvcnQgKiBhcyBVdGlsIGZyb20gJy4uL3V0aWwnXG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRTZXR0aW5ncyhydW5EaXI6IEF0b21UeXBlcy5EaXJlY3RvcnkpIHtcbiAgY29uc3QgcmVhZFNldHRpbmdzID0gYXN5bmMgKGZpbGU6IEF0b21UeXBlcy5GaWxlKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGV4ID0gYXdhaXQgZmlsZS5leGlzdHMoKVxuICAgICAgaWYgKGV4KSB7XG4gICAgICAgIGNvbnN0IGNvbnRlbnRzID0gYXdhaXQgZmlsZS5yZWFkKClcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXR1cm4gSlNPTi5wYXJzZShjb250ZW50cylcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZEVycm9yKGBGYWlsZWQgdG8gcGFyc2UgJHtmaWxlLmdldFBhdGgoKX1gLCB7XG4gICAgICAgICAgICBkZXRhaWw6IGVycixcbiAgICAgICAgICAgIGRpc21pc3NhYmxlOiB0cnVlLFxuICAgICAgICAgIH0pXG4gICAgICAgICAgdGhyb3cgZXJyXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiB7fVxuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBpZiAoZXJyb3IpIHsgVXRpbC53YXJuKGVycm9yKSB9XG4gICAgICByZXR1cm4ge31cbiAgICB9XG4gIH1cblxuICBjb25zdCBsb2NhbFNldHRpbmdzID0gcmVhZFNldHRpbmdzKHJ1bkRpci5nZXRGaWxlKCcuaGFza2VsbC1naGMtbW9kLmpzb24nKSlcblxuICBjb25zdCBbcHJvamVjdERpcl0gPSBhdG9tLnByb2plY3QuZ2V0RGlyZWN0b3JpZXMoKS5maWx0ZXIoKGQpID0+IGQuY29udGFpbnMocnVuRGlyLmdldFBhdGgoKSkpXG4gIGNvbnN0IHByb2plY3RTZXR0aW5ncyA9XG4gICAgcHJvamVjdERpciA/XG4gICAgICByZWFkU2V0dGluZ3MocHJvamVjdERpci5nZXRGaWxlKCcuaGFza2VsbC1naGMtbW9kLmpzb24nKSlcbiAgICAgIDpcbiAgICAgIFByb21pc2UucmVzb2x2ZSh7fSlcblxuICBjb25zdCBjb25maWdEaXIgPSBuZXcgRGlyZWN0b3J5KGF0b20uZ2V0Q29uZmlnRGlyUGF0aCgpKVxuICBjb25zdCBnbG9iYWxTZXR0aW5ncyA9IHJlYWRTZXR0aW5ncyhjb25maWdEaXIuZ2V0RmlsZSgnaGFza2VsbC1naGMtbW9kLmpzb24nKSlcblxuICBjb25zdCBbZ2xvYiwgcHJqLCBsb2NdID0gYXdhaXQgUHJvbWlzZS5hbGwoW2dsb2JhbFNldHRpbmdzLCBwcm9qZWN0U2V0dGluZ3MsIGxvY2FsU2V0dGluZ3NdKVxuICByZXR1cm4geyAuLi5nbG9iLCAuLi5wcmosIC4uLmxvYyB9XG59XG4iXX0=