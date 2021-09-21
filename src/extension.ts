'use strict'

import * as vscode from 'vscode'
import * as https from 'https'
import { URL, URLSearchParams } from 'url'


export function activate(context: vscode.ExtensionContext) {

	const urlParts = ['protocol', 'username', 'password', 'hostname', 'port', 'pathname', 'search', 'hash']
	const titleLength = 75
	const titlePadChar = '-'

	function formatTitle(text: string) {
		const padding = Math.floor((titleLength - (text.length + 2)) / 2)
		return titlePadChar.repeat(padding) + ' ' + text + ' ' + titlePadChar.repeat(padding)
	}

	function isValidURL(text: string) {
		try {
			new URL(text)
			return true
		} catch (e) {
			return false
		}
	}

	function registerReplacingCmd(cmd: string, fn: Function, async: boolean = false) {
		const disposable = vscode.commands.registerCommand('extension.' + cmd, function () {
			const editor = vscode.window.activeTextEditor

			if (editor) {
				const document = editor.document
				const selections = editor.selections
				const isEmpty = selections.length === 1 && selections[0].isEmpty
				const resetSelection = (success: boolean) => {
					if (isEmpty && success) {
						editor.selection = new vscode.Selection(editor.selection.end, editor.selection.end)
					}
				}

				editor.edit(editBuilder => {
					if (isEmpty) {
						// nothing selected, select all
						const fullText = document.getText()
						const fullRange = new vscode.Range(
							document.positionAt(0),
							document.positionAt(fullText.length)
						)
						if (async) {
							fn(fullText, (newText: string) => {
								editor.edit(editBuilder => {
									editBuilder.replace(fullRange, newText)
								}).then(resetSelection)
							})
						} else {
							const newText = fn(fullText)
							editBuilder.replace(fullRange, newText)
						}
					} else {
						for (const selection of selections) {
							const text = document.getText(selection)
							if (async) {
								fn(text, (newText: string) => {
									editor.edit(editBuilder => {
										editBuilder.replace(selection, newText)
									}).then(resetSelection)
								})
							} else {
								const newText = fn(text)
								editBuilder.replace(selection, newText)
							}
						}
					}
				}).then(resetSelection)
			}
		})
		context.subscriptions.push(disposable)
	}

	registerReplacingCmd('urldecode', decodeURI)

	registerReplacingCmd('urlencode', encodeURI)

	registerReplacingCmd('urlparse', (text: string) => {
		if (!isValidURL(text)) {
			return text
		}

		function queryParse(query: URLSearchParams) {
			const params = Array.from(query.entries())
			const longestParamLen = Math.max(...params.map(x => x[0].length))
			let rows = []
			for (const param of params) {
				rows.push({ length: longestParamLen + 3 - param[0].length, name: param[0], value: param[1] })
			}
			return rows.map(x => (' '.repeat(x.length) + x.name + ' : ' + x.value)).join('\n')
		}

		const url = new URL(text)
		let result = ''
		for (const part of urlParts) {
			// @ts-ignore
			const val = url[part]
			if (!val) {
				continue
			}

			result += formatTitle(part) + '\n\n'

			if (part === 'search') {
				result += queryParse(url.searchParams)
			} else {
				result += val
			}

			result += '\n\n'
		}
		return result
	})

	registerReplacingCmd('urlunparse', (text: string) => {
		const parts = urlParts.filter(x => text.indexOf(formatTitle(x)) !== -1)
		const formattedParts = parts.map(x => formatTitle(x))

		if (parts.length === 0) {
			// not a parsed url
			return text
		}

		// URL class requires a url to initialize
		const url = new URL('http://a.com')

		for (let i = 0; i < parts.length; i++) {
			const isLast = i === parts.length - 1

			const start = text.indexOf(formattedParts[i]) + formattedParts[i].length
			const end = isLast ? text.length : text.indexOf(formattedParts[i + 1])

			let value = text.substring(start, end)

			if (parts[i] === 'search') {
				const lines = value.split('\n')
				for (const line of lines) {
					if (line.trim().length === 0) {
						continue
					}
					const lineParts = line.split(' : ')
					const key = lineParts[0].trim()
					const value = lineParts[1].trim()
					url.searchParams.append(key, value)
				}
			} else {
				// @ts-ignore
				url[parts[i]] = value.trim()
			}
		}

		return url.toString()
	})

	registerReplacingCmd('urlresponse', (text: string, cb: Function) => {
		https.get(text, (resp) => {
			let data = ''

			resp.on('data', (chunk) => {
				data += chunk
			})

			resp.on('end', () => {
				cb(data)
			})

		}).on("error", (err) => {
			console.log("Error: " + err.message)
		})
	}, true)
}