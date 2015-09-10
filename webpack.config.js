module.exports = {
	entry: "./example.ls",
	output: {
		path: __dirname,
		filename: "bundle.js"
	},
	module: {
		loaders: [
			{ test: /\.ls$/, loader: "livescript" }
		]
	}
};
