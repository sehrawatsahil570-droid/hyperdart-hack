import pkg from './package.json' with {type:'json'}

export default  {
	// import name from package.json
	name: pkg.name,
	triggers: {
		keywords: [
			'npm', 'package info', 'packages like', 'compare packages', 'npm package for', 'library for', 'alternatives to',
			'alternative to', 'similar packages', 'replacement for', 'node package', 'node module', 'js library',
			'javascript library', 'package for', 'library to', 'bundle size', 'esm support', 'typescript support'
		]
		// in the future, we can add other types of triggers
	},
	query_format: {
		regex: [
			// Details: "npm express", "what is express", "express npm"
			'(npm( packages?)?|package info) HD_PACKAGES.NPM_PACKAGES',
			'(what is|tell me about|info on|details (of|for)) HD_PACKAGES.NPM_PACKAGES( npm| package)?',
			'HD_PACKAGES.NPM_PACKAGES (npm|package|library|module)( info| details)?',

			// Latest version: "latest version of react", "react latest version"
			'(latest|current|newest) version of HD_PACKAGES.NPM_PACKAGES',
			'HD_PACKAGES.NPM_PACKAGES (latest|current|newest)( version)?',

			// Compare: "compare a, b, c", "a vs b", "a or b", "difference between a and b"
			'compare( npm)?( packages?)? HD_PACKAGES.NPM_PACKAGES(,| vs| versus| and)? HD_PACKAGES.NPM_PACKAGES((,| vs| versus| and)? HD_PACKAGES.NPM_PACKAGES)?',
			'HD_PACKAGES.NPM_PACKAGES (vs|versus|or) HD_PACKAGES.NPM_PACKAGES((,| vs| versus| or) HD_PACKAGES.NPM_PACKAGES)?',
			'(difference|differences) between HD_PACKAGES.NPM_PACKAGES and HD_PACKAGES.NPM_PACKAGES',

			// Alternatives: "alternatives to moment", "moment alternatives", "replace moment"
			'(npm )?(alternatives?( to| for)|packages? (like|similar to)|replacements? for|replace|instead of) HD_PACKAGES.NPM_PACKAGES( npm)?',
			'HD_PACKAGES.NPM_PACKAGES (alternatives?|replacements?|competitors?)',

			// Versions: "express 4 vs 5", "react@18 vs react@19"
			'HD_PACKAGES.NPM_PACKAGES( v?[0-9.]+)? (vs|versus) (HD_PACKAGES.NPM_PACKAGES )?v?[0-9.]+',
			'HD_PACKAGES.NPM_PACKAGES@[0-9.]+ (vs|versus) (HD_PACKAGES.NPM_PACKAGES)?@?[0-9.]+',

			// Install cost and compatibility: "is axios esm", "express typescript", "lodash bundle size"
			'(is |does )?HD_PACKAGES.NPM_PACKAGES( support)? (esm|cjs|commonjs|typescript|types|size|bundle size|install size|node version|deprecated)',

			// Release history: "express changelog", "react releases"
			'HD_PACKAGES.NPM_PACKAGES (releases|release history|changelog|versions)',

			// Use case (no package named): "best npm package for date formatting", "library for parsing csv"
			'(best|top|good|recommended) (npm |node |javascript |js )?(packages?|librar(y|ies)|modules?) (for|to) [a-z0-9 ]+',
			'(npm |node |javascript |js )?(packages?|librar(y|ies)|modules?) (for|to) [a-z0-9 ]+',
		]
		// in the future, we can add other types of query formats
	},
	client: {
		// location of client side code
		// should point to pkg.umd - but currently that points to dist/index.umd.js
		location: pkg.module,
		// name of the UMD module
		moduleName: pkg.umdName || 'HD' + pkg.name,
		// baseURL is only used in local testing and ignored after publish
		// Optional: defaults to '/name' (the name of the component)
		baseURL: '/' + pkg.name,

	},
	format: {
		mainline: true,
		sidebar: true
		// "sidebar" / "mainline" / "ribbon" / "fullscreen"
	},
	permissions: {

	},
	info: {
		// key-values added here will be added to the compInfo section of searchData
	},
	github: "https://github.com/sehrawatsahil570-droid/hyperdart-hack",
	demovideo: ""
}
