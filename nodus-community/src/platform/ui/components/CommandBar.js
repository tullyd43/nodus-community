/**
 * @file CommandBar.js
 * @description Apple-style command bar component
 * Built using atomic elements for consistency
 */

import { AtomicElement, Button, Container } from '@platform/ui/AtomicElements.js';

export class CommandBar extends AtomicElement {
	constructor(props = {}) {
		super('div', {
			...props,
			className: 'nodus-command-bar',
			'data-component': 'command-bar'
		});
		
		this.position = props.position || 'top-left';
		this.commands = props.commands || [];
		this.commandElements = [];
		
		this.setupCommandBarStyles();
		this.buildCommands();
		this.setupKeyboardShortcuts();
	}

	setupCommandBarStyles() {
		const positionMap = {
			'top-left': { top: '20px', left: '20px' },
			'top-center': { top: '20px', left: '50%', transform: 'translateX(-50%)' },
			'top-right': { top: '20px', right: '20px' },
			'center': { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
		};

		const styles = {
			position: 'fixed',
			display: 'flex',
			alignItems: 'center',
			gap: 'var(--space-sm)',
			padding: 'var(--space-sm)',
			background: 'rgba(255, 255, 255, 0.8)',
			backdropFilter: 'var(--blur-md) saturate(1.8)',
			WebkitBackdropFilter: 'var(--blur-md) saturate(1.8)',
			border: '0.5px solid rgba(255, 255, 255, 0.2)',
			borderRadius: 'var(--radius-lg)',
			boxShadow: `
				var(--shadow-sm),
				var(--shadow-lg),
				inset 0 1px 0 rgba(255, 255, 255, 0.8)
			`,
			zIndex: '1000',
			userSelect: 'none',
			fontFamily: 'var(--font-family)',
			...positionMap[this.position],
		};

		Object.assign(this.element.style, styles);
	}

	buildCommands() {
		this.element.innerHTML = '';
		this.commandElements = [];
		
		this.commands.forEach((command, index) => {
			if (command.type === 'separator') {
				const separator = new Container({
					style: {
						width: '1px',
						height: '24px',
						background: 'rgba(0, 0, 0, 0.1)',
						margin: '0 var(--space-xs)',
					}
				});
				this.appendChild(separator);
			} else {
				const button = new Button({
					variant: command.variant || (command.icon && !command.label ? 'icon' : 'secondary'),
					size: 'small',
					textContent: command.label,
					icon: command.icon,
					'data-command': command.id,
					style: command.style || {}
				});

				if (command.tooltip) {
					button.element.title = command.tooltip;
				}

				if (command.action) {
					button.addEventListener('click', async (e) => {
						e.preventDefault();
						try {
							await command.action(e, command);
						} catch (error) {
							console.error(`Command ${command.id} failed:`, error);
						}
					});
				}

				this.appendChild(button);
				this.commandElements.push({ command, button });
			}
		});
	}

	setupKeyboardShortcuts() {
		document.addEventListener('keydown', (e) => {
			this.commands.forEach(command => {
				if (command.shortcut && this.matchesShortcut(e, command.shortcut)) {
					e.preventDefault();
					if (command.action) {
						command.action(e, command);
					}
				}
			});
		});
	}

	matchesShortcut(event, shortcut) {
		const keys = shortcut.toLowerCase().split('+');
		const hasCtrl = keys.includes('ctrl') || keys.includes('cmd');
		const hasShift = keys.includes('shift');
		const hasAlt = keys.includes('alt');
		const key = keys.find(k => !['ctrl', 'cmd', 'shift', 'alt'].includes(k));

		return (
			(!hasCtrl || (event.ctrlKey || event.metaKey)) &&
			(!hasShift || event.shiftKey) &&
			(!hasAlt || event.altKey) &&
			(!key || event.key.toLowerCase() === key)
		);
	}

	updateCommand(commandId, updates) {
		const commandElement = this.commandElements.find(ce => ce.command.id === commandId);
		if (commandElement) {
			Object.assign(commandElement.command, updates);
			this.buildCommands();
		}
	}

	addCommand(command, position = -1) {
		if (position === -1) {
			this.commands.push(command);
		} else {
			this.commands.splice(position, 0, command);
		}
		this.buildCommands();
	}

	removeCommand(commandId) {
		this.commands = this.commands.filter(cmd => cmd.id !== commandId);
		this.buildCommands();
	}
}
