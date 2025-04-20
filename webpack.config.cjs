const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');

// ================= 可配置变量 =================
const OUTPUT_DIR = 'public';      // 输出目录（默认输出到项目根目录的public文件夹）
const PUBLIC_PATH = '/';          // 静态资源引用路径（根据实际部署调整）
// =============================================

module.exports = (env, argv) => {
    const isProduction = argv.mode === 'production';

    return {
        entry: {
            'download.worker': './public/download/download.worker.js',
        },
        output: {
            filename: '[name].js',
            path: path.resolve(__dirname, OUTPUT_DIR), // 使用可配置输出目录
            publicPath: PUBLIC_PATH,                  // 使用可配置资源路径
        },
        optimization: {
            minimize: isProduction,
            minimizer: [new TerserPlugin()],
            splitChunks: false,
        },
        module: {
            rules: [
                {
                    test: /\.js$/,
                    exclude: /node_modules|lib\/jszip\.min\.js/,
                    use: {
                        loader: 'babel-loader',
                        options: {
                            presets: ['@babel/preset-env'],
                        },
                    },
                },
            ],
        },
        plugins: [
            // 复制文件到输出目录
            new CopyPlugin({
                patterns: [
                    {
                        from: 'public/download/downloader.worker.js',
                        to: 'downloader.worker.js'
                    },
                    {
                        from: 'public/download/download-utils.worker.js',
                        to: 'download-utils.worker.js'
                    },
                    {
                        from: 'public/download/IndexDB.worker.js',
                        to: 'IndexDB.worker.js'
                    },
                    {
                        from: 'public/download/lib/jszip.min.js',
                        to: 'lib/jszip.min.js'
                    },
                ],
            }),
            // 自动替换路径插件
            {
                apply(compiler) {
                    compiler.hooks.emit.tap('ReplaceImportPaths', (compilation) => {
                        compilation.hooks.processAssets.tap({
                            name: 'ReplaceImportPaths',
                            stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_TRANSFER,
                        }, (assets) => {
                            if (assets['download.worker.js']) {
                                let content = assets['download.worker.js'].source();
                                const replacePath = (original) =>
                                    original.replace(
                                        /importScripts\(['"]\.\/(.*?)['"]\)/g,
                                        `importScripts("${PUBLIC_PATH}$1")`
                                    );

                                content = replacePath(content);
                                compilation.updateAsset(
                                    'download.worker.js',
                                    new compiler.webpack.sources.RawSource(content)
                                );
                            }
                        })
                    });
                },
            },
        ],
    };
};
