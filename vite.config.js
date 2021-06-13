import path from 'path';

export default ({ command, mode }) => {
	if (command === 'serve') {
		return {
			// serve specific config
			build: {
				lib: {
					entry: path.resolve(__dirname, 'src/index.ts'),
					name: 'libfabric'
				}
			}
		}
	} else {
		return {
			// build specific config
			build: {
				lib: {
					entry: path.resolve(__dirname, 'src/index.ts'),
					name: 'libfabric'
				}
			}
		}
	}
}
