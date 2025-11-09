/**
 * @file VirtualList.js
 * @description Lightweight, framework-free virtualized list for community release.
 * Removed SafeDOM and ForensicLogger dependencies for simplified implementation.
 */

/**
 * @class VirtualList
 * @classdesc High-performance virtualized list with item recycling, keyboard navigation,
 * sticky headers, and resize-aware windowing. Perfect for handling large datasets.
 *
 * @example
 * const vlist = new VirtualList({
 *   container: document.querySelector('#list'),
 *   itemHeight: 44, // or provide itemSize:(i)=>number for variable height
 *   count: () => data.length,
 *   render: (el, i) => { el.textContent = data[i].title; },
 *   keyOf: (i) => data[i].id,
 * });
 * vlist.mount();
 */
export class VirtualList {
	/**
	 * @param {Object} options - Configuration options
	 * @param {HTMLElement} options.container - Scrollable container (position:relative recommended)
	 * @param {number} [options.itemHeight] - Fixed height per row (px). Provide OR itemSize().
	 * @param {(index:number)=>number} [options.itemSize] - Variable size callback (px).
	 * @param {()=>number} options.count - Total item count getter
	 * @param {(el:HTMLElement, index:number)=>void} options.render - Render callback (recycles el)
	 * @param {(index:number)=>string|number} [options.keyOf] - Stable key extractor for recycling
	 * @param {number} [options.overscan=6] - Extra items before/after viewport
	 * @param {boolean} [options.recycle=true] - Reuse DOM nodes for performance
	 * @param {boolean} [options.keyboard=true] - Enable arrow/page/home/end navigation
	 * @param {boolean} [options.stickyHeader=false] - Reserve sticky header slot
	 * @param {(el:HTMLElement)=>void} [options.renderHeader] - Header render callback
	 */
	constructor(options) {
		this.opt = {
			overscan: 6,
			recycle: true,
			keyboard: true,
			stickyHeader: false,
			...options,
		};

		// Validate required options
		if (!this.opt.container) {
			throw new Error("VirtualList: container required");
		}
		if (!this.opt.count || !this.opt.render) {
			throw new Error("VirtualList: count and render callbacks required");
		}
		if (!this.opt.itemHeight && !this.opt.itemSize) {
			throw new Error(
				"VirtualList: provide itemHeight or itemSize callback"
			);
		}

		// Setup container
		this._root = this.opt.container;
		this._root.setAttribute("role", "list");
		this._root.tabIndex = this._root.tabIndex || 0;

		// Ensure proper container styles
		Object.assign(this._root.style, {
			overflow: this._root.style.overflow || "auto",
			position: this._root.style.position || "relative",
		});

		// Internal state
		this._viewportH = this._root.clientHeight;
		this._scrollTop = 0;
		this._pool = []; // Recycled DOM nodes
		this._inUse = new Map(); // index -> node mapping
		this._keys = new Map(); // key -> node mapping for stable reuse
		this._raf = 0;
		this._mounted = false;

		// Create spacer element to simulate full list height
		this._spacer = document.createElement("div");
		Object.assign(this._spacer.style, {
			position: "relative",
			width: "1px",
			height: "0px",
		});

		// Setup sticky header if enabled
		if (this.opt.stickyHeader) {
			this._header = document.createElement("div");
			Object.assign(this._header.style, {
				position: "sticky",
				top: "0",
				zIndex: "1",
				willChange: "transform",
			});
			this._root.appendChild(this._header);
			if (this.opt.renderHeader) {
				this.opt.renderHeader(this._header);
			}
		}

		this._root.appendChild(this._spacer);

		// Bind event handlers
		this._onScroll = this._onScroll.bind(this);
		this._onResize = this._onResize.bind(this);
		this._onKey = this._onKey.bind(this);

		// Setup resize observer
		this._resizeObs = new ResizeObserver(this._onResize);
		this._resizeObs.observe(this._root);
	}

	/**
	 * Mount the virtual list and start observing
	 * @public
	 */
	mount() {
		if (this._mounted) return;

		this._mounted = true;

		// Add event listeners
		this._root.addEventListener("scroll", this._onScroll, {
			passive: true,
		});
		if (this.opt.keyboard) {
			this._root.addEventListener("keydown", this._onKey);
		}

		// Initialize
		this._syncTotalHeight();
		this._schedule();

		console.log("[VirtualList] Mounted with", this.opt.count(), "items");
	}

	/**
	 * Unmount the virtual list and cleanup
	 * @public
	 */
	unmount() {
		if (!this._mounted) return;

		this._mounted = false;

		// Remove event listeners
		this._root.removeEventListener("scroll", this._onScroll);
		this._root.removeEventListener("keydown", this._onKey);
		this._resizeObs.disconnect();
		cancelAnimationFrame(this._raf);

		// Cleanup DOM
		for (const [, node] of this._inUse) {
			node.remove();
		}
		this._inUse.clear();
		this._pool.length = 0;
		this._keys.clear();

		if (this._spacer?.parentNode) {
			this._spacer.remove();
		}
		if (this._header?.parentNode) {
			this._header.remove();
		}

		console.log("[VirtualList] Unmounted");
	}

	/**
	 * Refresh the list when data changes
	 * @public
	 */
	refresh() {
		this._syncTotalHeight();
		this._schedule();
	}

	/**
	 * Scroll to specific item index
	 * @public
	 * @param {number} index - Item index to scroll to
	 * @param {string} [align="start"] - Alignment: "start", "center", or "end"
	 */
	scrollToIndex(index, align = "start") {
		const top = this._offsetOf(index);
		const height = this._sizeOf(index);
		const viewport = this._root.clientHeight;

		let scrollTop = top;

		if (align === "center") {
			scrollTop = Math.max(0, top - (viewport - height) / 2);
		} else if (align === "end") {
			scrollTop = Math.max(0, top - (viewport - height));
		}

		this._root.scrollTop = scrollTop;
	}

	/**
	 * Get the current visible range
	 * @public
	 * @returns {{start: number, end: number}} Visible index range
	 */
	getVisibleRange() {
		const visibleIndexes = Array.from(this._inUse.keys()).sort(
			(a, b) => a - b
		);
		return {
			start: visibleIndexes[0] ?? 0,
			end: visibleIndexes[visibleIndexes.length - 1] ?? 0,
		};
	}

	// ========== PRIVATE METHODS ==========

	/**
	 * Handle scroll events
	 * @private
	 */
	_onScroll() {
		this._scrollTop = this._root.scrollTop;
		this._schedule();
	}

	/**
	 * Handle resize events
	 * @private
	 */
	_onResize() {
		const nextHeight = this._root.clientHeight;
		if (nextHeight !== this._viewportH) {
			this._viewportH = nextHeight;
			this._schedule();
		}
	}

	/**
	 * Schedule update on next animation frame
	 * @private
	 */
	_schedule() {
		if (this._raf) cancelAnimationFrame(this._raf);
		this._raf = requestAnimationFrame(() => this._update());
	}

	/**
	 * Main update loop - renders visible items
	 * @private
	 */
	_update() {
		const count = this.opt.count();
		if (count === 0) {
			// Clear everything if no items
			for (const [, node] of this._inUse) {
				node.remove();
			}
			this._inUse.clear();
			return;
		}

		const viewportTop = this._scrollTop;
		const viewportBottom = viewportTop + this._viewportH;

		// Find visible range
		const firstVisible = this._findFirstIndexAtOrAbove(viewportTop);
		const lastVisible = this._findLastIndexAtOrBelow(viewportBottom);

		// Add overscan
		const overscan = this.opt.overscan;
		const start = Math.max(0, firstVisible - overscan);
		const end = Math.min(count - 1, lastVisible + overscan);

		// Remove nodes outside visible range
		for (const [index, node] of this._inUse) {
			if (index < start || index > end) {
				this._inUse.delete(index);
				if (this.opt.recycle) {
					this._pool.push(node);
				} else {
					node.remove();
				}
			}
		}

		// Add nodes for visible range
		for (let index = start; index <= end; index++) {
			if (this._inUse.has(index)) continue;

			// Try to reuse node by key
			const key = this.opt.keyOf?.(index);
			let node = key != null ? this._keys.get(key) : undefined;

			// Check if node is still available
			if (node && node.parentElement !== this._spacer) {
				node = undefined;
			}

			// Get node from pool or create new
			if (!node) {
				node = this._pool.pop() || this._createItem();
			}

			// Position and size the node
			Object.assign(node.style, {
				position: "absolute",
				left: "0",
				right: "0",
				transform: `translateY(${this._offsetOf(index)}px)`,
				height: `${this._sizeOf(index)}px`,
			});

			// Render content
			node.dataset.index = String(index);
			this.opt.render(node, index);

			// Mount node
			this._spacer.appendChild(node);
			this._inUse.set(index, node);

			if (key != null) {
				this._keys.set(key, node);
			}
		}
	}

	/**
	 * Create a new list item element
	 * @private
	 * @returns {HTMLElement} New item element
	 */
	_createItem() {
		const element = document.createElement("div");
		element.setAttribute("role", "listitem");
		Object.assign(element.style, {
			willChange: "transform",
			contain: "content",
		});
		return element;
	}

	/**
	 * Sync total height of the spacer element
	 * @private
	 */
	_syncTotalHeight() {
		const count = this.opt.count();
		const totalHeight = this._offsetOf(count);
		this._spacer.style.height = `${totalHeight}px`;
	}

	/**
	 * Get size of item at index
	 * @private
	 * @param {number} index - Item index
	 * @returns {number} Item height in pixels
	 */
	_sizeOf(index) {
		if (index < 0) return 0;
		return this.opt.itemHeight ?? this.opt.itemSize(index);
	}

	/**
	 * Get cumulative offset to item at index
	 * @private
	 * @param {number} index - Item index
	 * @returns {number} Offset in pixels
	 */
	_offsetOf(index) {
		if (index <= 0) return 0;

		if (this.opt.itemHeight) {
			return index * this.opt.itemHeight;
		}

		// Variable size: sum up previous items
		let sum = 0;
		for (let i = 0; i < index; i++) {
			sum += this.opt.itemSize(i);
		}
		return sum;
	}

	/**
	 * Find first item index at or above given Y position
	 * @private
	 * @param {number} y - Y position
	 * @returns {number} Item index
	 */
	_findFirstIndexAtOrAbove(y) {
		const count = this.opt.count();

		if (this.opt.itemHeight) {
			// Binary search for fixed height
			return Math.min(count - 1, Math.floor(y / this.opt.itemHeight));
		}

		// Linear search for variable height
		let sum = 0;
		for (let i = 0; i < count; i++) {
			if (sum + this._sizeOf(i) > y) {
				return i;
			}
			sum += this._sizeOf(i);
		}
		return Math.max(0, count - 1);
	}

	/**
	 * Find last item index at or below given Y position
	 * @private
	 * @param {number} y - Y position
	 * @returns {number} Item index
	 */
	_findLastIndexAtOrBelow(y) {
		const count = this.opt.count();

		if (this.opt.itemHeight) {
			return Math.max(
				0,
				Math.min(count - 1, Math.floor(y / this.opt.itemHeight))
			);
		}

		let sum = 0;
		for (let i = 0; i < count; i++) {
			const nextSum = sum + this._sizeOf(i);
			if (nextSum >= y) {
				return i;
			}
			sum = nextSum;
		}
		return Math.max(0, count - 1);
	}

	/**
	 * Handle keyboard navigation
	 * @private
	 * @param {KeyboardEvent} e - Keyboard event
	 */
	_onKey(e) {
		const count = this.opt.count();
		if (!count) return;

		// Get current focused item
		const currentFocused = this._root.querySelector(
			'[data-index-focus="1"]'
		);
		const currentIndex = currentFocused
			? parseInt(currentFocused.dataset.index)
			: -1;

		// Get visible range
		const visible = Array.from(this._inUse.keys()).sort((a, b) => a - b);
		const topVisible = visible[0] ?? 0;
		const bottomVisible = visible[visible.length - 1] ?? 0;

		let targetIndex = currentIndex;

		switch (e.key) {
			case "ArrowDown":
				targetIndex = Math.min(
					count - 1,
					currentIndex >= 0 ? currentIndex + 1 : topVisible
				);
				break;
			case "ArrowUp":
				targetIndex = Math.max(
					0,
					currentIndex >= 0 ? currentIndex - 1 : bottomVisible
				);
				break;
			case "PageDown":
				targetIndex = Math.min(count - 1, bottomVisible);
				break;
			case "PageUp":
				targetIndex = Math.max(0, topVisible);
				break;
			case "Home":
				targetIndex = 0;
				break;
			case "End":
				targetIndex = count - 1;
				break;
			default:
				return; // Don't prevent default for other keys
		}

		e.preventDefault();

		// Scroll to target and focus
		this.scrollToIndex(targetIndex, "start");

		// Set focus indicator
		const targetNode = this._inUse.get(targetIndex);
		if (targetNode) {
			// Remove previous focus
			this._root
				.querySelectorAll('[data-index-focus="1"]')
				.forEach((node) => node.removeAttribute("data-index-focus"));

			// Set new focus
			targetNode.setAttribute("data-index-focus", "1");

			// Focus element if it supports it
			if (targetNode.focus) {
				targetNode.focus();
			}
		}
	}
}

export default VirtualList;
