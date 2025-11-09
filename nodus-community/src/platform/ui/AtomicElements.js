/**
 * @file AtomicElements.js
 * @description Base atomic UI elements used throughout Nodus
 * These are the fundamental building blocks that both the app and users will use
 */

/**
 * Base component class for all atomic elements
 */
export class AtomicElement {
	constructor(tag = 'div', props = {}) {
		this.element = document.createElement(tag);
		this.props = props;
		this.children = [];
		this.listeners = new Map();
		
		this.applyProps();
		this.setupBaseStyles();
	}

	applyProps() {
		Object.entries(this.props).forEach(([key, value]) => {
			if (key === 'className') {
				this.element.className = value;
			} else if (key === 'style') {
				Object.assign(this.element.style, value);
			} else if (key.startsWith('data-')) {
				this.element.setAttribute(key, value);
			} else if (key === 'textContent') {
				this.element.textContent = value;
			} else if (key === 'innerHTML') {
				this.element.innerHTML = value;
			}
		});
	}

	setupBaseStyles() {
		this.element.style.boxSizing = 'border-box';
	}

	appendChild(child) {
		if (child instanceof AtomicElement) {
			this.element.appendChild(child.element);
			this.children.push(child);
		} else if (child instanceof HTMLElement) {
			this.element.appendChild(child);
		}
		return this;
	}

	addEventListener(event, handler) {
		this.element.addEventListener(event, handler);
		this.listeners.set(event, handler);
		return this;
	}

	mount(parent) {
		if (parent instanceof AtomicElement) {
			parent.appendChild(this);
		} else if (parent instanceof HTMLElement) {
			parent.appendChild(this.element);
		} else if (typeof parent === 'string') {
			document.querySelector(parent)?.appendChild(this.element);
		}
		return this;
	}

	destroy() {
		this.listeners.forEach((handler, event) => {
			this.element.removeEventListener(event, handler);
		});
		this.listeners.clear();
		this.children.forEach(child => {
			if (child.destroy) child.destroy();
		});
		this.element.remove();
	}
}

/**
 * Button atomic element
 */
export class Button extends AtomicElement {
	constructor(props = {}) {
		super('button', props);
		this.variant = props.variant || 'primary';
		this.size = props.size || 'medium';
		this.icon = props.icon;
		
		this.setupStyles();
		this.setupContent();
		this.setupInteractions();
	}

	setupStyles() {
		const baseStyles = {
			border: 'none',
			borderRadius: '8px',
			cursor: 'pointer',
			fontFamily: 'var(--font-family)',
			fontWeight: '500',
			transition: 'all var(--transition-medium)',
			display: 'inline-flex',
			alignItems: 'center',
			justifyContent: 'center',
			gap: '6px',
			outline: 'none',
			position: 'relative',
			userSelect: 'none',
		};

		const sizeMap = {
			small: { padding: '6px 12px', fontSize: '13px', minHeight: '28px' },
			medium: { padding: '8px 16px', fontSize: '14px', minHeight: '36px' },
			large: { padding: '12px 20px', fontSize: '16px', minHeight: '44px' },
		};

		const variantMap = {
			primary: {
				background: 'linear-gradient(180deg, var(--color-blue) 0%, var(--color-blue-dark) 100%)',
				color: 'white',
				boxShadow: '0 1px 3px rgba(0, 122, 255, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
			},
			secondary: {
				background: 'var(--color-surface)',
				color: 'var(--color-gray-900)',
				border: '0.5px solid rgba(0, 0, 0, 0.04)',
				backdropFilter: 'var(--blur-md)',
			},
			ghost: {
				background: 'transparent',
				color: 'var(--color-blue)',
			},
			icon: {
				background: 'var(--color-surface)',
				color: 'var(--color-gray-900)',
				borderRadius: 'var(--radius-sm)',
				minWidth: sizeMap[this.size].minHeight,
				padding: '8px',
			}
		};

		Object.assign(this.element.style, baseStyles, sizeMap[this.size], variantMap[this.variant]);
	}

	setupContent() {
		if (this.icon && this.variant === 'icon') {
			this.element.innerHTML = this.icon;
		} else {
			let content = '';
			if (this.icon) content += this.icon;
			if (this.props.textContent) {
				content += `<span>${this.props.textContent}</span>`;
			}
			if (content) this.element.innerHTML = content;
		}
	}

	setupInteractions() {
		this.element.addEventListener('mouseenter', () => {
			if (this.variant === 'primary') {
				this.element.style.transform = 'translateY(-1px)';
				this.element.style.boxShadow = '0 4px 12px rgba(0, 122, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)';
			} else {
				this.element.style.background = 'var(--color-surface-secondary)';
			}
		});

		this.element.addEventListener('mouseleave', () => {
			if (this.variant === 'primary') {
				this.element.style.transform = 'translateY(0)';
				this.element.style.boxShadow = '0 1px 3px rgba(0, 122, 255, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)';
			} else {
				this.element.style.background = this.variant === 'ghost' ? 'transparent' : 'var(--color-surface)';
			}
		});

		this.element.addEventListener('mousedown', () => {
			this.element.style.transform = 'scale(0.98)';
		});

		this.element.addEventListener('mouseup', () => {
			this.element.style.transform = 'scale(1)';
		});
	}
}

/**
 * Container atomic element for layout and grouping
 */
export class Container extends AtomicElement {
	constructor(props = {}) {
		super('div', props);
		this.layout = props.layout || 'flex';
		this.direction = props.direction || 'row';
		this.gap = props.gap || 'var(--space-sm)';
		this.padding = props.padding || '0';
		
		this.setupLayoutStyles();
	}

	setupLayoutStyles() {
		const layoutMap = {
			flex: {
				display: 'flex',
				flexDirection: this.direction,
				gap: this.gap,
				padding: this.padding,
			},
			grid: {
				display: 'grid',
				gap: this.gap,
				padding: this.padding,
			},
			block: {
				display: 'block',
				padding: this.padding,
			}
		};

		Object.assign(this.element.style, layoutMap[this.layout]);
	}
}

/**
 * Grid Block atomic element
 */
export class GridBlock extends AtomicElement {
	constructor(props = {}) {
		super('div', {
			...props,
			className: `nodus-grid-block ${props.className || ''}`,
			'data-component': 'grid-block',
			'data-block-id': props.blockId || crypto.randomUUID()
		});

		this.blockType = props.type || 'content';
		this.blockProps = props.blockProps || {};
		
		this.setupGridStyles();
		this.buildContent();
		this.setupGridInteractions();
	}

	setupGridStyles() {
		const styles = {
			background: 'var(--color-surface)',
			backdropFilter: 'var(--blur-sm)',
			border: '1px solid rgba(0, 0, 0, 0.08)',
			borderRadius: 'var(--radius-md)',
			padding: 'var(--space-md)',
			cursor: 'pointer',
			transition: 'all var(--transition-medium)',
			position: 'relative',
			overflow: 'hidden',
		};

		Object.assign(this.element.style, styles);
	}

	buildContent() {
		if (this.blockProps.title) {
			const title = new Container({
				textContent: this.blockProps.title,
				style: {
					fontWeight: '600',
					fontSize: '16px',
					marginBottom: 'var(--space-sm)',
					color: 'var(--color-gray-900)',
				}
			});
			this.appendChild(title);
		}

		if (this.blockProps.content) {
			const content = new Container({
				innerHTML: this.blockProps.content,
				style: {
					fontSize: '14px',
					lineHeight: '1.5',
					color: 'var(--color-gray-700)',
				}
			});
			this.appendChild(content);
		}
	}

	setupGridInteractions() {
		this.element.addEventListener('mouseenter', () => {
			this.element.style.transform = 'translateY(-2px)';
			this.element.style.boxShadow = 'var(--shadow-md)';
			this.element.style.borderColor = 'rgba(0, 122, 255, 0.3)';
		});

		this.element.addEventListener('mouseleave', () => {
			this.element.style.transform = 'translateY(0)';
			this.element.style.boxShadow = 'none';
			this.element.style.borderColor = 'rgba(0, 0, 0, 0.08)';
		});
	}
}

/**
 * Text atomic element
 */
export class Text extends AtomicElement {
	constructor(props = {}) {
		const tag = props.variant === 'heading' ? 'h2' : 'p';
		super(tag, props);
		this.variant = props.variant || 'body';
		this.setupTextStyles();
	}

	setupTextStyles() {
		const variantMap = {
			heading: {
				fontSize: '20px',
				fontWeight: '600',
				color: 'var(--color-gray-900)',
				margin: '0 0 var(--space-sm) 0',
			},
			subheading: {
				fontSize: '16px',
				fontWeight: '500',
				color: 'var(--color-gray-800)',
				margin: '0 0 var(--space-xs) 0',
			},
			body: {
				fontSize: '14px',
				fontWeight: '400',
				color: 'var(--color-gray-700)',
				lineHeight: '1.5',
				margin: '0',
			},
			caption: {
				fontSize: '12px',
				fontWeight: '400',
				color: 'var(--color-gray-500)',
				margin: '0',
			}
		};

		Object.assign(this.element.style, variantMap[this.variant]);
	}
}

/**
 * Modal atomic element
 */
export class Modal extends AtomicElement {
	constructor(props = {}) {
		super('div', {
			...props,
			'data-component': 'modal'
		});

		this.setupModalStyles();
		this.createModalStructure();
	}

	setupModalStyles() {
		const styles = {
			position: 'fixed',
			top: '0',
			left: '0',
			right: '0',
			bottom: '0',
			background: 'rgba(0, 0, 0, 0.5)',
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'center',
			zIndex: '2000',
			backdropFilter: 'var(--blur-sm)',
		};

		Object.assign(this.element.style, styles);
	}

	createModalStructure() {
		this.dialog = new Container({
			style: {
				background: 'var(--color-surface)',
				backdropFilter: 'var(--blur-md)',
				borderRadius: 'var(--radius-xl)',
				padding: 'var(--space-lg)',
				minWidth: '400px',
				maxWidth: '90vw',
				maxHeight: '90vh',
				boxShadow: 'var(--shadow-lg)',
				border: '1px solid rgba(255, 255, 255, 0.2)',
				overflow: 'auto',
			}
		});

		this.appendChild(this.dialog);

		// Close on backdrop click
		this.addEventListener('click', (e) => {
			if (e.target === this.element) {
				this.destroy();
			}
		});
	}

	setContent(content) {
		this.dialog.element.innerHTML = '';
		if (content instanceof AtomicElement) {
			this.dialog.appendChild(content);
		} else if (typeof content === 'string') {
			this.dialog.element.innerHTML = content;
		}
	}
}
