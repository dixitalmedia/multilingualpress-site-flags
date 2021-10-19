/*
 * TODO Introduce check of js coding standards https://standardjs.com/index.html#install
 * TODO Introduce Encore to replace webpack
 */

const process = require('process')
const gulp = require('gulp')
const {series, parallel, src, dest} = gulp
const zip = require('gulp-zip')
const unzip = require('gulp-unzip')
const del = require('del')
const minimist = require('minimist')
const fs = require('fs')
const readline = require('readline')
const pump = require('pump')
const usage = require('gulp-help-doc')
const {spawn} = require('child_process')
const fetch = require('node-fetch')
const wpPot = require('wp-pot')
const replace = require('gulp-replace')
const sass = require('gulp-sass')
const rename = require('gulp-rename')
const uglify = require('gulp-uglify')
const concat = require('gulp-concat')
const tmp = require('tmp')
const sourcemaps = require('gulp-sourcemaps')
const date = require('date-and-time')

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
				'!public/{css,css/**,js,js/**}',
				'!src/modules/**/{public/css,public/css/**}',
				'!src/modules/**/{public/js,public/js/**}',
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

/**
 * Make Pot File
 */
function _makePot({baseDir, buildDir, langDir, l: local, textDomain}) {
	/**
	 * Generates a POT file for translation.
	 *
	 * This typically means scanning all production source files for i18n,
	 * and using a POT generator to compile the internationalized strings into a file.
	 */
	return function makePot(done) {
		const workDir = local ? baseDir : buildDir;

		wpPot({
			relativeTo: workDir,
			metadataFile: `${workDir}/multilingualpress.php`,
			destFile: `${workDir}/${langDir}/en_GB.pot`,
			src: [
				`${workDir}/src/**/*.php`,
				`${workDir}/multilingualpress.php`,
				`${workDir}/uninstall.php`,
				`${workDir}/modules/**/*.php`,

				// PHP parse error. Looks like it doesn't understand unpacking.
				`!${workDir}/src/modules/WooCommerce/TranslationUi/Product/MetaboxFields.php`,
			]
		});

		done();
	}
}

function _downloadTranslations({baseDir, buildDir, langDir, translationsApiUrl, l: local}) {
	/**
	 * Downloads translations, Eurotext-style.
	 *
	 * This will try the configured URL, download archives for each language,
	 * unpack them, and put them in the right directory.
	 */
	return function downloadTranslations(done) {
		const workDir = local ? baseDir : buildDir;

		fetch(translationsApiUrl)
			// Decode JSON
			.then(response => response.json())
			// Get translations list
			.then(jsonResponse => jsonResponse.translations)
			// For each translation
			.then(translations => translations.forEach(
				translation => {
					log(`Translation in language "${translation.language}" found`);
					let translationUrl = translation.package

					// Download translation archive
					fetch(translationUrl)
						.then(response => {
							// Create temporary file
							tmp.file((err, path, fd, cleanupCallback) => {
								if (err) {
									log.err(err)
									done(err)
									return
								}

								// Save translations archive to temporary file
								let tmpStream = fs.createWriteStream(path);
								response.body.pipe(tmpStream).on('finish', function () {
									// Extract *.mo files from translations archive into languages dir
									pump(
										src(path),
										unzip({
											filter: file => file.path.endsWith('.mo')
										}),
										dest(langDir, {cwd: workDir}),
										done
									)
								})

							})
						}).catch(error => {
						log.err(error)
						done(error)
					})
				}
			)).catch(error => {
			log.err(error)
			done(error)
		})
	}
}

function _setPluginVersion({packageVersion, buildDir}) {
	/**
	 * Updates the `Version` plugin header with the version of this build.
	 */
	return function setPluginVersion(done) {
		pump(
			src(['multilingualpress.php'], {cwd: buildDir, base: buildDir}),
			replace(/\* Version: .+/, `* Version: ${packageVersion}`),
			dest('.', {cwd: buildDir, base: buildDir}),
			done,
		)
	}
}

function _installPhp({buildDir, depsVersionPhp}) {
	/**
	 * Install PHP dependencies.
	 *
	 * This typically includes using Composer to install dependencies with production settings.
	 */
	return function installPhp(done) {
		chain([
			(done) => {
				return exec('composer', ['config', 'platform.php', depsVersionPhp], {cwd: buildDir}, done)
			},
			(done) => {
				return exec(`composer`, ['install', '--prefer-dist', '--optimize-autoloader', '--no-dev'], {cwd: buildDir}, done)
			},
		], done);
	}
}

function _installPhar({buildDir}) {
	/**
	 * Install Phar dependencies.
	 *
	 * This typically includes using Phive to install dependencies with production settings.
	 */
	return function installPhar(done) {
		chain([
			(done) => {
				return exec('phive', ['install', '--force-accept-unsigned', '--copy'], {cwd: buildDir}, done)
			},
		], done);
	}
}

function _installJs({buildDir}) {
	/**
	 * Install JS dependencies.
	 *
	 * This typically includes installing NPM dependencies with production settings.
	 */
	return function installJs(done) {
		chain([
			(done) => {
				return exec('npm', ['install', '--production'], {cwd: buildDir}, done)
			},
		], done);
	}
}

function _archive({baseDir, buildDir, distDir, packageVersion, packageName}) {
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
						'!src/modules/**/{resources,resources/**}', // Asset sources
						'vendor/**/*.*',
						'modules/**/*.*',
						'!modules/**/{resources,resources/**}', // Asset sources
						'LICENSE',
						'changelog.txt',
						'README.md',
						'multilingualpress.php',
						'uninstall.php',

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
				let modMatches

				if (/^resources\//.test(path.dirname)) {
					newPath.dirname = 'public/css'
				} else if (modMatches = /^src\/modules\/([\w\d_.-]+)\//.exec(path.dirname)) {
					let modName = modMatches[1]
					newPath.dirname = `src/modules/${modName}/public/css`
				}

				return newPath
			}),
			dest('.', {cwd: workDir, base: workDir}),
			done
		)
	}
}

/**
 * Compile admin js
 *
 * @param done
 */
function _processJs({baseDir, buildDir, l: local}) {
	return function processJs(done) {
		const workDir = local ? baseDir : buildDir;

		chain([
			// Admin
			(cb) => {
				pump(
					src([
						'resources/js/namespace.js',
						'resources/js/admin/**',
						'resources/js/admin.js',
					], {cwd: workDir, base: `${workDir}/resources/js`}),
					concat('admin.js'),
					uglify(),
					rename({suffix: '.min'}),
					dest(`public/js`, {cwd: workDir, base: `${workDir}/resources/js`}),
					cb,
				)
			},
			// Other
			(cb) => {
				pump(
					src([
						'resources/js/onboarding.js',
						'resources/js/pointers.js',
					], {cwd: workDir, base: `${workDir}/resources/js`}),
					uglify(),
					rename({suffix: '.min'}),
					dest(`public/js`, {cwd: workDir, base: `${workDir}/resources/js`}),
					cb,
				)
			},
			(cb) => {
				exec(
					'node_modules/webpack/bin/webpack.js',
					['-p', `--buildBasePath=${workDir}`],
					{cwd: baseDir},
					done,
				)
			},
		], done);
	}
}

function _setLicenseUrl({buildDir, licenseUrl}) {
	/**
	 * Sets the URL of the licensing server used by the plugin
	 * to activate/deactivate its license.
	 */
	return function setLicenseUrl(done) {
		pump(
			src(['src/inc/constants.php'], {cwd: buildDir, base: buildDir}),
			replace(
				/(const\sMULTILINGUALPRESS_LICENSE_API_URL\s=)\s''/g,
				`$1 '${licenseUrl.toLowerCase()}'`,
			),
			dest('.', {cwd: buildDir, base: buildDir}),
			done,
		)
	}
}

function _setWcTrackingCode({buildDir, wc}) {
	return async function setWcTrackingCode(done) {
		let trackingCode = (await getFirstLine('.woocommerce-tracking-code'))
		if (wc && !trackingCode) {
			throw new Error('Missing WooCommerce tracking code')
		}

		if (!wc) {
			trackingCode = '';
		}

		pump(
			src(['multilingualpress.php'], {cwd: buildDir, base: buildDir}),
			replace(
				'{{ Woo-Tracking-Code }}',
				trackingCode,
			),
			dest('./', {cwd: buildDir, base: buildDir}),
			done,
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
 * Installs PHP dependencies at the right PHP version.
 *
 * @task {installPhp}
 * @arg {depsVersionPhp} The version of PHP to use for installing deps. Default: 7.0.33.
 */
exports.installPhp = series(
	_installPhp(options),
)

/**
 * Installs Phar distributions.
 *
 * @task {installPhar}
 */
exports.installPhar = series(
	_installPhar(options),
)

/**
 * Installs Node dependencies.
 *
 * @task {installJs}
 */
exports.installJs = series(
	_installJs(options),
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
 * Processes JS files.
 *
 * @task {processJs}
 * @args {local} Use this flag process in the working dir instead of build dir.
 */
exports.processJs = series(
	_processJs(options),
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
 * Generates a POT file.
 *
 * @task {makePot}
 * @args {local} Use this flag process in the working dir instead of build dir.
 * @args {langDir} Name of the directory to store language files. Default: 'languages'.
 */
exports.makePot = series(
	_makePot(options),
)

/**
 * Downloads translations from a Eurotext API.
 *
 * @task {downloadTranslations}
 * @args {local} Use this flag process in the working dir instead of build dir.
 * @args {translationsApiUrl} The URL of the corresponding translation project.
 */
exports.downloadTranslations = series(
	_downloadTranslations(options),
)

/**
 * Handles translations.
 *
 * @task {processTranslations}
 * @args {local} Use this flag process in the working dir instead of build dir.
 * @args {translationsApiUrl} The URL of the corresponding translation project.
 */
exports.processTranslations = series(
	exports.makePot,
	exports.downloadTranslations,
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
 * Installs project dependencies.
 *
 * @task {install}
 * @arg {depsVersionPhp} The version of PHP to use for installing deps. Default: 7.0.33.
 */
exports.install = parallel(
	exports.installJs,
	exports.installPhp,
	exports.installPhar,
)

/**
 * Sets the URL of the licensing endpoint to be used by the package.
 *
 * @task {setLicenseUrl}
 * @arg {licenseUrl} The URL of the licensing endpoint.
 */
exports.setLisenceUrl = series(
	_setLicenseUrl(options),
)

/**
 * Sets the WooCommerce tracking code.
 *
 * See .woocommerce-tracking-code file.
 *
 * @task {setWcTrackingCode}
 */
exports.setWcTrackingCode = series(
	_setWcTrackingCode(options),
)

/**
 * Replaces the version number in the plugin header.
 *
 * @task {setPluginVersion}
 * @arg {packageVersion} The version of the package.
 */
exports.setPluginVersion = series(
	_setPluginVersion(options),
)

/**
 * Sets plugin properties in the main file.
 *
 * @task {setPluginProps}
 * @arg {packageVersion} The version of the package.
 */
exports.setPluginProps = series (
	exports.setPluginVersion,
	exports.setWcTrackingCode,
)

/**
 * Process the source and other files.
 *
 * @task {process}
 * @arg {packageVersion} The version of the package.
 * @arg {licenseUrl} The URL of the licensing endpoint.
 * @args {translationsApiUrl} The URL of the corresponding translation project.
 */
exports.process = parallel(
	exports.processAssets,
	exports.processTranslations,
	exports.setLisenceUrl,
	exports.setPluginProps,
)

/**
 * Create a build in the corresponding directory.
 *
 * @task {build}
 * @order {2}
 * @arg {packageVersion} The version of the package.
 * @arg {buildDir} The directory to use for building.
 * @arg {licenseUrl} The URL of the licensing endpoint.
 * @args {translationsApiUrl} The URL of the corresponding translation project.
 */
exports.build = series(
	exports.clean,
	exports.copy,
	exports.install,
	exports.process,
)

/**
 * Create a dist archive of a build in the corresponding directory.
 *
 * @task {dist}
 * @order {1}
 * @arg {packageVersion} The version of the package.
 * @arg {buildDir} The directory to use for building.
 * @arg {licenseUrl} The URL of the licensing endpoint.
 * @args {translationsApiUrl} The URL of the corresponding translation project.
 */
exports.dist = series(
	exports.build,
	exports.archive,
)

exports.default = series(
	exports.build,
)
