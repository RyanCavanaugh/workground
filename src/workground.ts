declare const require: any;
declare let editor: monaco.editor.IStandaloneCodeEditor;

require.config({ paths: { 'vs': '../node_modules/monaco-editor/dev/vs' } });

const libEntryPoint = "lib.d.ts";
let libFileText: string = 'oops';

namespace VFS {
	const filenames: string[] = [];
	const contents: string[] = [];

	export function add(filename: string, content: string) {
		filenames.push(filename);
		contents.push(content);
	}

	export function read(filename: string) {
		const index = filenames.indexOf(filename);
		return contents[index];
	}

	export function exists(filename: string) {
		return filenames.indexOf(filename) >= 0;
	}
}

function init() {
	// Load ES6 lib files
	getLibFile(libEntryPoint, libSrc => {
		VFS.add(libEntryPoint, libSrc);
		loadDependents(libSrc, loadMonaco);
	});
}

function loadDependents(srcText: string, done: () => void) {
	const srcFile = ts.createSourceFile('lib.something.d.ts', srcText, ts.ScriptTarget.Latest);
	const queue = srcFile.referencedFiles.map(ref => ref.fileName);

	if(queue.length === 0) {
		done();
	} else {
		next();
	}

	function next() {
		let fn: string = undefined;
		while(queue.length > 0) {
			fn = queue.pop();
			if (!VFS.exists(fn)) break;
		}
		if (fn === undefined) {
			done();
		} else {
			getLibFile(fn, src => {
				VFS.add(fn, src);
				next();
			});
		}
	}
}

function getLibFile(filenameOnly: string, done: (content: string) => void) {
	console.log('load ' + filenameOnly);
	$.ajax({
		url: `../node_modules/typescript/lib/${filenameOnly}`,
		complete: data => {
			done(data.responseText);
		}
	});	
}

function loadMonaco() {
	require(['vs/editor/editor.main'], setup);
}

function setup() {
	const opts: any = {
		target: monaco.languages.typescript.ScriptTarget.ES6,
		noEmit: true,
		noLib: false,
		noImplicitAny: false,
		allowNonTsExtensions: true
	};
	monaco.languages.typescript.typescriptDefaults.setCompilerOptions(opts);

	editor = monaco.editor.create(document.getElementById('editor'), {
		value: [
			'function x() {',
			'\tconsole.log("Hello world!");',
			'}',
			'let j = [] + 42;',
			'let y: string = null',
		].join('\n'),
		language: 'typescript'
	});

	editor.getModel().onDidChangeContent(function(e) {
		const content = editor.getModel().getValue();
		renderAST();
	});
	renderAST();
}

class WorkgroundHost implements ts.CompilerHost {
	private sourceFiles = new Map<string, ts.SourceFile>();
    getSourceFile(fileName: string, languageVersion: ts.ScriptTarget, onError?: (message: string) => void): ts.SourceFile {
    	if (this.sourceFiles.has(fileName)) {
    		return this.sourceFiles.get(fileName);
    	}
    	if (VFS.exists(fileName)) {
    		const sf = ts.createSourceFile(fileName, VFS.read(fileName), languageVersion);
    		console.log('create ' + sf);
    		this.sourceFiles.set(fileName, sf);
    		return sf;
    	} else {
	    	return ts.createSourceFile(fileName, editor.getModel().getValue(), languageVersion);
	    }
    }

    getDefaultLibFileName(options: ts.CompilerOptions): string {
    	return ts.getDefaultLibFileName(options);
    }
    getDefaultLibLocation?(): string;
    writeFile() { }
    getCurrentDirectory(): string {
    	return '/';
    }
    getDirectories(path: string): string[] {
    	return [];
    }
    getCanonicalFileName(fileName: string): string {
    	return fileName;
    }
    useCaseSensitiveFileNames(): boolean {
    	return false;
    }
    getNewLine(): string {
    	return '\r\n';
    }
    // resolveTypeReferenceDirectives?(typeReferenceDirectiveNames: string[], containingFile: string): ResolvedTypeReferenceDirective[];

    fileExists(fileName: string): boolean {
    	return false;
    }
    readFile(fileName: string): string {
    	return '';
    }
}

const host = new WorkgroundHost();

let oldProgram: ts.Program = undefined;
function renderErrors() {
	const mainFilename = 'input.ts';
	const program = ts.createProgram([mainFilename], { skipDefaultLibCheck: true, skipLibCheck: true }, host, oldProgram);
	oldProgram = program;
	let diags = program.getGlobalDiagnostics();
	diags = diags.concat(program.getSyntacticDiagnostics());
	diags = diags.concat(program.getSemanticDiagnostics());
	document.getElementById('error-list').innerText = diags.map(d => d.messageText).join('; ');
}

function renderAST() {
	const sourceText = editor.getModel().getValue();
	const src = ts.createSourceFile("foo.ts", sourceText, ts.ScriptTarget.Latest, true);
	const lineMap = src.getLineStarts();
	let indent = 0;
	let output: string[] = [];
	ts.forEachChild(src, emit);

	function makeIndent() {
		return new Array(indent + 1).join('    ');
	}
	function linePos(pos: number) {
		for (let i = 0; i < lineMap.length; i++) {
			if (pos >= lineMap[i]) {
				return `Line ${i + 1} col ${pos - lineMap[i] + 1}`;
			}
		}
		return '???';
	}
	function flags(f: ts.NodeFlags) {
		const result: string[] = [];
		for (const s in ts.NodeFlags) {
			const n = ts.NodeFlags[s] as any;
			if (typeof n === 'number') {
				if ((n !== 0) && ((n & (n - 1)) === 0)) {
					if (f & n) {
						result.push(s as string);
					}
				}
			}
		}
		return result.join(' | ');
	}

	function emit(node: ts.Node) {
		output.push(`${makeIndent()}${ts.SyntaxKind[node.kind]} @ ${linePos(node.pos)} len ${node.end - node.pos} ${flags(node.flags)}`);
		indent++;
		ts.forEachChild(node, emit);
		indent--;
	}

	document.getElementById('output').innerText = output.join('\r\n');
	renderErrors();
}

init();