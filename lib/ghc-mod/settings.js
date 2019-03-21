"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const atom_1 = require("atom");
const Util = require("../util");
async function getSettings(runDir) {
    const localSettings = readSettings(runDir.getFile('.haskell-ghc-mod.json'));
    const [projectDir] = atom.project
        .getDirectories()
        .filter((d) => d.contains(runDir.getPath()));
    const projectSettings = projectDir
        ? readSettings(projectDir.getFile('.haskell-ghc-mod.json'))
        : Promise.resolve({});
    const configDir = new atom_1.Directory(atom.getConfigDirPath());
    const globalSettings = readSettings(configDir.getFile('haskell-ghc-mod.json'));
    const [glob, prj, loc] = await Promise.all([
        globalSettings,
        projectSettings,
        localSettings,
    ]);
    return Object.assign({}, glob, prj, loc);
}
exports.getSettings = getSettings;
async function readSettings(file) {
    try {
        const contents = await file.read();
        if (contents !== null) {
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
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2V0dGluZ3MuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvZ2hjLW1vZC9zZXR0aW5ncy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLCtCQUFzQztBQUN0QyxnQ0FBK0I7QUFTeEIsS0FBSyxVQUFVLFdBQVcsQ0FBQyxNQUFpQjtJQUNqRCxNQUFNLGFBQWEsR0FBRyxZQUFZLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDLENBQUE7SUFFM0UsTUFBTSxDQUFDLFVBQVUsQ0FBQyxHQUFHLElBQUksQ0FBQyxPQUFPO1NBQzlCLGNBQWMsRUFBRTtTQUNoQixNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQTtJQUM5QyxNQUFNLGVBQWUsR0FBRyxVQUFVO1FBQ2hDLENBQUMsQ0FBQyxZQUFZLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1FBQzNELENBQUMsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFBO0lBRXZCLE1BQU0sU0FBUyxHQUFHLElBQUksZ0JBQVMsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQyxDQUFBO0lBQ3hELE1BQU0sY0FBYyxHQUFHLFlBQVksQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLHNCQUFzQixDQUFDLENBQUMsQ0FBQTtJQUU5RSxNQUFNLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsR0FBRyxNQUFNLE9BQU8sQ0FBQyxHQUFHLENBQUM7UUFDekMsY0FBYztRQUNkLGVBQWU7UUFDZixhQUFhO0tBQ2QsQ0FBQyxDQUFBO0lBQ0YseUJBQVksSUFBSSxFQUFLLEdBQUcsRUFBSyxHQUFHLEVBQUU7QUFDcEMsQ0FBQztBQW5CRCxrQ0FtQkM7QUFFRCxLQUFLLFVBQVUsWUFBWSxDQUFDLElBQVU7SUFDcEMsSUFBSTtRQUNGLE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBSSxDQUFDLElBQUksRUFBRSxDQUFBO1FBQ2xDLElBQUksUUFBUSxLQUFLLElBQUksRUFBRTtZQUNyQixJQUFJO2dCQUNGLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQTthQUM1QjtZQUFDLE9BQU8sR0FBRyxFQUFFO2dCQUNaLElBQUksQ0FBQyxhQUFhLENBQUMsUUFBUSxDQUFDLG1CQUFtQixJQUFJLENBQUMsT0FBTyxFQUFFLEVBQUUsRUFBRTtvQkFDL0QsTUFBTSxFQUFFLEdBQUc7b0JBQ1gsV0FBVyxFQUFFLElBQUk7aUJBQ2xCLENBQUMsQ0FBQTtnQkFDRixNQUFNLEdBQUcsQ0FBQTthQUNWO1NBQ0Y7YUFBTTtZQUNMLE9BQU8sRUFBRSxDQUFBO1NBQ1Y7S0FDRjtJQUFDLE9BQU8sS0FBSyxFQUFFO1FBQ2QsSUFBSSxLQUFLLEVBQUU7WUFDVCxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFBO1NBQ2pCO1FBQ0QsT0FBTyxFQUFFLENBQUE7S0FDVjtBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBGaWxlLCBEaXJlY3RvcnkgfSBmcm9tICdhdG9tJ1xuaW1wb3J0ICogYXMgVXRpbCBmcm9tICcuLi91dGlsJ1xuXG5leHBvcnQgaW50ZXJmYWNlIEdIQ01vZFNldHRpbmdzIHtcbiAgZGlzYWJsZT86IGJvb2xlYW5cbiAgc3VwcHJlc3NFcnJvcnM/OiBib29sZWFuXG4gIGdoY09wdGlvbnM/OiBzdHJpbmdbXVxuICBnaGNNb2RPcHRpb25zPzogc3RyaW5nW11cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldFNldHRpbmdzKHJ1bkRpcjogRGlyZWN0b3J5KTogUHJvbWlzZTxHSENNb2RTZXR0aW5ncz4ge1xuICBjb25zdCBsb2NhbFNldHRpbmdzID0gcmVhZFNldHRpbmdzKHJ1bkRpci5nZXRGaWxlKCcuaGFza2VsbC1naGMtbW9kLmpzb24nKSlcblxuICBjb25zdCBbcHJvamVjdERpcl0gPSBhdG9tLnByb2plY3RcbiAgICAuZ2V0RGlyZWN0b3JpZXMoKVxuICAgIC5maWx0ZXIoKGQpID0+IGQuY29udGFpbnMocnVuRGlyLmdldFBhdGgoKSkpXG4gIGNvbnN0IHByb2plY3RTZXR0aW5ncyA9IHByb2plY3REaXJcbiAgICA/IHJlYWRTZXR0aW5ncyhwcm9qZWN0RGlyLmdldEZpbGUoJy5oYXNrZWxsLWdoYy1tb2QuanNvbicpKVxuICAgIDogUHJvbWlzZS5yZXNvbHZlKHt9KVxuXG4gIGNvbnN0IGNvbmZpZ0RpciA9IG5ldyBEaXJlY3RvcnkoYXRvbS5nZXRDb25maWdEaXJQYXRoKCkpXG4gIGNvbnN0IGdsb2JhbFNldHRpbmdzID0gcmVhZFNldHRpbmdzKGNvbmZpZ0Rpci5nZXRGaWxlKCdoYXNrZWxsLWdoYy1tb2QuanNvbicpKVxuXG4gIGNvbnN0IFtnbG9iLCBwcmosIGxvY10gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgZ2xvYmFsU2V0dGluZ3MsXG4gICAgcHJvamVjdFNldHRpbmdzLFxuICAgIGxvY2FsU2V0dGluZ3MsXG4gIF0pXG4gIHJldHVybiB7IC4uLmdsb2IsIC4uLnByaiwgLi4ubG9jIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gcmVhZFNldHRpbmdzKGZpbGU6IEZpbGUpOiBQcm9taXNlPEdIQ01vZFNldHRpbmdzPiB7XG4gIHRyeSB7XG4gICAgY29uc3QgY29udGVudHMgPSBhd2FpdCBmaWxlLnJlYWQoKVxuICAgIGlmIChjb250ZW50cyAhPT0gbnVsbCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgcmV0dXJuIEpTT04ucGFyc2UoY29udGVudHMpXG4gICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZEVycm9yKGBGYWlsZWQgdG8gcGFyc2UgJHtmaWxlLmdldFBhdGgoKX1gLCB7XG4gICAgICAgICAgZGV0YWlsOiBlcnIsXG4gICAgICAgICAgZGlzbWlzc2FibGU6IHRydWUsXG4gICAgICAgIH0pXG4gICAgICAgIHRocm93IGVyclxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4ge31cbiAgICB9XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgaWYgKGVycm9yKSB7XG4gICAgICBVdGlsLndhcm4oZXJyb3IpXG4gICAgfVxuICAgIHJldHVybiB7fVxuICB9XG59XG4iXX0=