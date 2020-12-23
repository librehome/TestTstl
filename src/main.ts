import * as ts from 'typescript';
import * as tstl from './tstl';
import { libFileMap } from './lib/lib';

function printResult(r: string) {
    let h1 = document.createElement("pre");
    h1.innerText = r;
    document.body.appendChild(h1);
}

function createSystem(files: { [name: string]: string }): ts.System {
    files = { ...files };
    return {
      args: [],
      createDirectory: () => {
        throw new Error("createDirectory not implemented");
      },
      directoryExists: directory =>
        Object.keys(files).some(path => path.startsWith(directory)),
      exit: () => {
        throw new Error("exit not implemented");
      },
      fileExists: fileName => {
        console.log("fileExists: " + fileName);
        return files[fileName] != null;
      },
      getCurrentDirectory: () => "/",
      getDirectories: () => [],
      getExecutingFilePath: () => {
        throw new Error("getExecutingFilePath not implemented");
      },
      readDirectory: directory => (directory === "/" ? Object.keys(files) : []),
      readFile: fileName => {
            console.log("readFile: " + fileName);
          return files[fileName];
      },
      resolvePath: path => path,
      newLine: "\n",
      useCaseSensitiveFileNames: true,
      write: () => {
        throw new Error("write not implemented");
      },
      writeFile: (fileName, contents) => {
        files[fileName] = contents;
      }
    };
  }
  
const compilerOptions: tstl.CompilerOptions = ts.getDefaultCompilerOptions();
compilerOptions.rootDir = "inmemory://model/";
compilerOptions.luaLibImport = tstl.LuaLibImportKind.None;
compilerOptions.luaTarget = tstl.LuaTarget.LuaJIT;
compilerOptions.sourceMap = true;

compilerOptions.target = ts.ScriptTarget.ES2019;
console.log("compilerOptions.target:" + compilerOptions.target!);
console.log("compilerOptions.lib:" + compilerOptions.lib!);
//compilerOptions.lib = ["dom", "es5", "es2015.collection", "es2015.iterable", "es2015.promise"]

const dummyName = "temp.ts";

function _getScriptText(fileName: string): string | undefined {
    let text: string;
    const libizedFileName = 'lib.' + fileName + '.d.ts';
    if (fileName in libFileMap) {
        text = libFileMap[fileName];
    } else if (libizedFileName in libFileMap) {
        text = libFileMap[libizedFileName];
    } else {
        return;
    }
    console.log("_getScriptText:" + fileName + ",len=" + text.length);
    return text;
}

function transpileLua(code: string) {
    const files: { [name: string]: string } = {
        [dummyName]: code
    };
    const sys = createSystem({
        ...libFileMap,
        ...files
    });

    const compilerHost: ts.CompilerHost = {
        ...sys,
        getCanonicalFileName: fileName => fileName,
        getDefaultLibFileName: () => "lib.d.ts", //"lib.es2015.d.ts",
        getDirectories: () => [],
        getNewLine: () => sys.newLine,
        getSourceFile: filename => {
            console.log("getSourceFile:" + filename);
            return undefined;
        },
        useCaseSensitiveFileNames: () => sys.useCaseSensitiveFileNames
    };

    const names: [string] = [dummyName];
    /*
    for (const name of Object.keys(libFileMap)) {
        names.push(name);
    }
    */

    const languageServiceHost: ts.LanguageServiceHost = {
        ...compilerHost,
        getCompilationSettings: () => compilerOptions,
        getDefaultLibFileName: options => {
            switch (options.target) {
                case 99 /* ESNext */:
                    const esnext = 'lib.esnext.full.d.ts';
                    if (esnext in libFileMap) return esnext;
                case 7 /* ES2020 */:
                case 6 /* ES2019 */:
                case 5 /* ES2018 */:
                case 4 /* ES2017 */:
                case 3 /* ES2016 */:
                case 2 /* ES2015 */:
                default:
                    // Support a dynamic lookup for the ES20XX version based on the target
                    // which is safe unless TC39 changes their numbering system
                    const eslib = `lib.es${2013 + (options.target || 99)}.full.d.ts`;
                    // Note: This also looks in _extraLibs, If you want
                    // to add support for additional target options, you will need to
                    // add the extra dts files to _extraLibs via the API.
                    if (eslib in libFileMap) {
                        return eslib;
                    }
    
                    return 'lib.es6.d.ts'; // We don't use lib.es2015.full.d.ts due to breaking change.
                case 1:
                case 0:
                    return 'lib.d.ts';
            }
        },
        getScriptFileNames: () => names,
        getScriptSnapshot: fileName => {
            let text: string | undefined;
            if (fileName === dummyName) {
                text = code;
                console.log("getScriptSnapshot: code");
            } else {
                text = _getScriptText(fileName);
                if (text === undefined) {
                    return;
                }
               return;
            }
            return <ts.IScriptSnapshot>{
                getText: (start, end) => text!.substring(start, end),
                getLength: () => text!.length,
                getChangeRange: () => undefined
            };
        },
        getScriptVersion: fileName => "1",
        writeFile: sys.writeFile
    };

    const languageService = ts.createLanguageService(languageServiceHost, ts.createDocumentRegistry());
    const program = languageService.getProgram()!;
    program.isSourceFileFromExternalLibrary = function (file: ts.SourceFile): boolean {
        console.log("isSourceFileFromExternalLibrary:" + file.fileName);
        return false;
    }
    program.isSourceFileDefaultLibrary = function (file: ts.SourceFile): boolean {
        console.log("isSourceFileDefaultLibrary:" + file.fileName);
        return false;
    }

    const emitHost: tstl.EmitHost = {
        getCurrentDirectory: () => "",
        readFile: (fileName: string) => {
            console.log("readFile:" + fileName);
            return fileName;
        },
        writeFile() {},
    };
    
    const transpiler = new tstl.Transpiler({ emitHost });    

    let ast!: tstl.File;
    let lua!: string;
    let sourceMap!: string;
    const sourceFile = program.getSourceFile(dummyName)!;
    //ts.createSourceFile("temp.ts", code, compilerOptions.target || ts.ScriptTarget.Latest);

    const { diagnostics } = transpiler.emit({
        program,
        sourceFiles: [sourceFile],
        writeFile(fileName, data, _writeBOM, _onError, sourceFiles = []) {
            console.log("writeFile:" + fileName);
            if (!sourceFiles.includes(sourceFile)) return;
            if (fileName.endsWith(".lua")) lua = data;
            if (fileName.endsWith(".lua.map")) sourceMap = data;
        },
        plugins: [
            {
                visitors: {
                    [ts.SyntaxKind.SourceFile](node, context) {
                        const [file] = context.superTransformNode(node) as [tstl.File];

                        if (node === sourceFile) {
                            ast = file;
                        }

                        return file;
                    },
                },
            },
        ],
    });

    return { diagnostics, ast, lua, sourceMap };
}

const textCode=`
// Declare exposed API
type Vector = [number, number, number];

enum Direction {
  Up,
  Down,
  Left,
  Right,
}

declare function findUnitsInRadius(this: void, center: Vector, radius: number): Unit[];
declare interface Unit {
    isEnemy(other: Unit): boolean;
    kill(): void;
    direction: Direction;
}


// Use declared API in code
function onAbilityCast(this: void, caster: Unit, targetLocation: Vector) {
    const units = findUnitsInRadius(targetLocation, 500);
    const enemies = units.filter(unit => caster.isEnemy(unit) && caster.direction == Direction.Up);

    for (const enemy of enemies) {
        enemy.kill();
    }
}`;

try {
    //const result = transpileLua(`const foo = "bar";`);
    const result = transpileLua(textCode);
    console.log("Success");
    printResult(result.lua);
    console.log(result.diagnostics);
    console.log(result.lua);
} catch (e) {
    console.log("Error");
    console.log(e);
    printResult(String(e));
}
