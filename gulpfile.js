/*
 * TODO Introduce check of js coding standards https://standardjs.com/index.html#install
 * TODO Introduce Encore to replace webpack
 */

const process = require('process')
const gulp = require('gulp')
const {series, parallel, src, dest} = gulp
const minimist = require('minimist')
const fs = require('fs')
const readline = require('readline')
const pump = require('pump')
const usage = require('gulp-help-doc')
const {spawn} = require('child_process')
const sass = require('gulp-sass')
const rename = require('gulp-rename')
const sourcemaps = require('gulp-sourcemaps')

const options = minimist(process.argv, {
	string: [
		'packageVersion',
		'packageName',
		'baseDir',
		'buildDir',
		'distDir',
		'langDir',
		'depsVersionPhp',
		'licenseUrl',
		'environment',
		'local',
	],
	bools: [
		'q', // Quiet
		'l', // Local
	],
	default: {
		packageVersion: '0.0.0-alpha1',
		packageName: 'multilingualpress-site-flags',
		textDomain: 'multilingualpress-site-flags',
		baseDir: __dirname,
		buildDir: `${__dirname}/build`,
		distDir: `${__dirname}/dist`,
		q: false,
		l: false,
		depsVersionPhp: '7.2',
	},
})


// --------------------------------------------------------------------
// FUNCTIONS
// --------------------------------------------------------------------

let log = (function (options) {

	/**
	 * Logs text.
	 *
	 * @param text The text to lot.
	 */
	let out = function (text) {
		if (!options.q) {
			console.log(text);
		}
	};

	/**
	 * Logs text as error.
	 *
	 * @param text
	 */
	let err = function (text) {
		console.error(text);
	}

	/**
	 * Logs text for debugging.
	 *
	 * @param text
	 */
	let debug = function (text) {
		if (!options.q) {
			console.debug(`${__filename}> ${text}`);
		}
	}

	/**
	 * @alias out()
	 */
	let log = function (text) {
		return out(text);
	};

	log.out = out;
	log.err = err;
	log.debug = debug;

	return log;
})(options);

let exec = (function (options) {
	/**
	 * @param {string} cmd The command to run.
	 * @param {Array<string>} args A list of arguments to run the command with
	 * @param {Object} settings Any settings for the child process.
	 * @param {Function<Function>[]} tasks The tasks to chain.
	 */
	return function (cmd, args, settings, cb) {
		args = args || []
		settings = settings || {}
		cb = cb || function () {
		}

		let fullCmd = cmd + (args ? ' ' + args.join(' ') : '');
		log(`exec: ${fullCmd}`);
		let stdout = ''
		let stderr = ''
		let error = null;
		let ps = spawn(cmd, args, settings);

		if (!options.q) {
			ps.stdout.pipe(process.stdout)
		}

		ps.stderr.on('data', (data) => {
			stderr += data.toString()
		})

		ps.stdout.on('data', (data) => {
			stdout += data.toString()
		})

		ps.on('error', (err) => {
			err = err.toString()
			error = new Error(err);
			cb(error, stdout, stderr);
		});

		ps.on('exit', (code) => {
			if (code) {
				error = new Error(`Subprocess exited with code ${code}\n${stderr}`);
			}

			log(`Exiting process ${cmd}`);
			cb(error, stdout, stderr);
		});

		return ps
	}
})(options)

/**
 * Runs tasks in the list, and executes a callback once they are all finished
 *
 * @param {Function<Function>[]} tasks The tasks to chain.
 * @param {Function} callback The callback that should run at the end of the chain.
 */
let chain = function (tasks, callback) {
	let task = tasks.shift()

	return task((error) => {
		if (error || !tasks.length) {
			return callback(error)
		}

		return chain(tasks, callback)
	})
}

let getFileLines = (function (options) {
	/**
	 * Retrieves file contents as lines asynchronously.
	 *
	 * @see https://nodejs.org/api/readline.html#readline_rl_symbol_asynciterator
	 *
	 * @param {String} filepath The path to the file, whose lines to retrieve. Relative to Gulpfile.
	 *
	 * @return {AsyncIterator<string>} The iterator of lines. Use with `for await .. of ..`
	 */
	return function (filepath) {
		filepath = `${options.buildDir}/${filepath}`
		let fileStream = fs.createReadStream(filepath)
		let rl = readline.createInterface({
			input: fileStream,
			crlfDelay: Infinity,
		})

		return rl;
	}
})(options)

let getFirstLine = (function (options) {
	/**
	 * Retrieves the fist line of a file at the specified path.
	 *
	 * @param {String} filepath The path to the file. Relative to Gulpfile.
	 * @return {String} The line.
	 */
	return async function (filepath) {
		for await (let line of getFileLines(filepath)) {
			return line;
		}
	}
})(options)


// --------------------------------------------------------------------
// TASKS
// --------------------------------------------------------------------

function _help() {
	return function help(done) {
		return usage(gulp)
	}
}

function _processCss({baseDir, buildDir, l: local}) {
	/**
	 * Convert Scss Files Into Css.
	 *
	 * This will also generate source maps.
	 * Anything in `resources` will to to `public/css`.
	 * Module css from `src/modules/<ModuleName>/resources/scss`
	 * will go to `src/modules/<ModuleName>/public/css`.
	 */
	return function processCss(done) {
		const workDir = local ? baseDir : buildDir;

		pump(
			src([
				'src/modules/*/resources/scss/*.scss',
				'resources/scss/*.scss',
			], {
				base: workDir,
				cwd: workDir,
				dot: true,
			}),
			sourcemaps.init(),
			sass({
				outputStyle: 'compressed',
				precision: 3,
			}),
			sourcemaps.write('./'),
			rename(path => {
				let newPath = {
					dirname: path.dirname,
					extname: path.extname,
					// Suffix doesn't work: https://github.com/hparra/gulp-rename/issues/95
					basename: `${path.basename}.min`,
				}
				newPath.dirname = 'public/css'

				return newPath
			}),
			dest('.', {cwd: workDir, base: workDir}),
			done
		)
	}
}

// --------------------------------------------------------------------
// TARGETS
// --------------------------------------------------------------------
/**
 * Prints the usage doc.
 *
 * You can always use global options `buildDir` and `distDir` to control where the build happens.
 * The `q` flag will suppress all but error output.
 * The `l` flag will, for some commands, result in modifications to the working directory.
 *
 * @task {help}
 * @order {0}
 */
exports.help = series(
	_help(options),
)

/**
 * Processes CSS files.
 *
 * @task {processCss}
 * @args {local} Use this flag to put the results into the working directory instead of build dir.
 */
exports.processCss = series(
	_processCss(options),
)

/**
 * Processes assets.
 *
 * @task {processAsserts}
 * @order {4}
 * @args {local} Use this flag process in the working dir instead of build dir.
 */
exports.processAssets = parallel(
	exports.processCss,
)

/**
 * Process the source and other files.
 *
 * @task {process}
 */
exports.process = parallel(
	exports.processAssets,
)

/**
 * Create a build in the corresponding directory.
 *
 * @task {build}
 * @order {2}
 */
exports.build = series(
	exports.process,
)

/**
 * Create a dist archive of a build in the corresponding directory.
 *
 * @task {dist}
 * @order {1}
 */
exports.dist = series(
	exports.build,
)

exports.default = series(
	exports.build,
)
