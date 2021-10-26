const process = require('process')
const gulp = require('gulp')
const {series, parallel, src, dest} = gulp
const minimist = require('minimist')
const pump = require('pump')
const usage = require('gulp-help-doc')
const sass = require('gulp-sass')
const rename = require('gulp-rename')
const sourcemaps = require('gulp-sourcemaps')

const options = minimist(process.argv, {
	string: [
		'baseDir',
	],
	bools: [
		'q', // Quiet
	],
	default: {
		baseDir: __dirname,
		q: false,
	},
})


// --------------------------------------------------------------------
// FUNCTIONS
// --------------------------------------------------------------------

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

function _processCss({baseDir}) {
	/**
	 * Convert Scss Files Into Css.
	 *
	 * This will also generate source maps.
	 * Anything in `resources` will to to `public/css`.
	 */
	return function processCss(done) {
		pump(
			src([
				'resources/scss/*.scss',
			], {
				base: baseDir,
				cwd: baseDir,
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
			dest('.', {cwd: baseDir, base: baseDir}),
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
 * The `q` flag will suppress all but error output.
 *
 * @task {help}
 */
exports.help = series(
	_help(options),
)

/**
 * Processes CSS files.
 *
 * @task {processCss}
 */
exports.processCss = series(
	_processCss(options),
)

/**
 * Processes assets.
 *
 * @task {processAsserts}
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
 */
exports.build = series(
	exports.process,
)

exports.default = series(
	exports.build,
)
