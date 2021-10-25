const process = require('process')
const gulp = require('gulp')
const {series, parallel, src, dest} = gulp
const zip = require('gulp-zip')
const del = require('del')
const minimist = require('minimist')
const pump = require('pump')
const usage = require('gulp-help-doc')
const {spawn} = require('child_process')
const sass = require('gulp-sass')
const rename = require('gulp-rename')
const sourcemaps = require('gulp-sourcemaps')
const date = require('date-and-time')

const options = minimist(process.argv, {
	string: [
		'packageVersion',
		'packageName',
		'baseDir',
		'buildDir',
		'distDir',
		'depsVersionPhp',
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

// --------------------------------------------------------------------
// TASKS
// --------------------------------------------------------------------

function _help() {
	return function help(done) {
		return usage(gulp)
	}
}

function _clean({baseDir, buildDir}) {
	return function clean(done) {
		del.sync([buildDir], {force: true, cwd: baseDir})
		done()
	}
}

function _copy({baseDir, buildDir, distDir}) {
	return function copy(done) {
		pump(
			src([
				// All files with all extensions
				`**/*`,
				`**/*.*`,

				// Not these though
				`!${buildDir}/**/*`,
				`!${distDir}/**/*`,
				'!.git/**/*',
				'!vendor/**/*',
				'!node_modules/**/*',
				// Not these because they need to be generated
				'!public/{css,css/**}',
				// Although vendor is totally ignored above, without the next line a similar error is thrown:
				// https://github.com/amphp/amp/issues/227
				// Presumably, a problem with symlinks, but not sure why
				'!vendor/amphp/**/asset',
			], {base: baseDir, cwd: baseDir, dot: true}),
			dest(buildDir),
			done
		)
	}
}

function _archive({buildDir, distDir, packageVersion, packageName}) {
	/**
	 * Archive the build into a single file.
	 *
	 * This typically involves compressing the files of the build that are needed for production
	 * into a single archive.
	 *
	 * The archive name will include the package name, version, shortened commit hash,
	 * and a timestamp.
	 */
	return function archive(done) {
		exec(
			`git log -n 1 | head -n 1 | sed -e 's/^commit //' | head -c 8`,
			[],
			{'shell': true},
			(error, stdout) => {
				if (error) {
					done(new Error(error));
				}

				let commit = stdout;
				let timestamp = date.format(new Date(), 'YYYY-MM-DD.HH-mm-ss', true)
				let archiveFileName = `${packageName}_${packageVersion}+${commit}.${timestamp}.zip`;

				pump(
					src([
						'inc/**/*.*',
						'languages/**/*.*',
						'public/**/*.*',
						'src/**/*.*',
						'vendor/**/*.*',
						'LICENSE',
						'README.md',
						'module.php',

						// Cleanup
						'!**/README',
						'!**/readme',
						'!**/readme.md',
						'!**/readme.txt',
						'!**/readme.txt',
						'!**/DEVELOPERS',
						'!**/developers',
						'!**/DEVELOPERS.md',
						'!**/developers.md',
						'!**/DEVELOPERS.txt',
						'!**/developers.txt',
						'!**/composer.json',
						'!**/composer.lock',
						'!**/package.json',
						'!**/package-lock.json',
						'!**/yarn.lock',
						'!**/phpunit.xml.dist',
						'!**/webpack.config.js',
						'!**/.github',
						'!**/.git',
						'!**/.gitignore',
						'!**/.gitattributes',
						'!**/Makefile',
						'!**/bitbucket-pipelines.yml',
						'!**/bin.yml',
						'!**/test.yml',
						'!**/tests.yml',
						'!**/*.js.map',
						'!**/*. css.map',
					], {
						base: buildDir,
						cwd: buildDir,
						dot: true,
					}),
					rename((path) => {
						path.dirname = `${packageName}/${path.dirname}`
					}),
					zip(archiveFileName),
					dest(distDir, {cwd: buildDir, base: buildDir}),
					(...args) => {
						log(`Archive created: ${archiveFileName}`);
						done(...args)
					},
				)
			}
		)
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
 * Cleans the build directory.
 *
 * @task {clean}
 * @arg {buildDir} The directory to use for building.
 */
exports.clean = series(
	_clean(options),
)

/**
 * Copies project files to build directory.
 *
 * Will skip Git files, as well as Composer and Node packages.
 *
 * @arg {buildDir} The directory to use for building.
 *
 * @task {copy}
 */
exports.copy = series(
	_copy(options),
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
 * Archives all files necessary for package distribution.
 *
 * @task {archive}
 * @arg {distDir} The directory to put the dist archive into.
 */
exports.archive = series(
	_archive(options),
)

/**
 * Process the source and other files.
 *
 * @task {process}
 * @arg {packageVersion} The version of the package.
 */
exports.process = parallel(
	exports.processAssets,
)

/**
 * Create a build in the corresponding directory.
 *
 * @task {build}
 * @order {2}
 * @arg {packageVersion} The version of the package.
 */
exports.build = series(
	exports.clean,
	exports.copy,
	exports.process,
)

/**
 * Create a dist archive of a build in the corresponding directory.
 *
 * @task {dist}
 * @order {1}
 * @arg {packageVersion} The version of the package.
 */
exports.dist = series(
	exports.build,
	exports.archive,
)

exports.default = series(
	exports.build,
)
