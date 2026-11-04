import esbuild from 'esbuild';
await esbuild.build({
	entryPoints: ['dev/harness.ts'],
	bundle: true,
	outfile: 'dev/harness.js',
	format: 'iife',
	target: 'es2020',
	logLevel: 'info',
});
