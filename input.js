// input.js - Input Manager for Bolo
class InputManager extends EventTarget {
    constructor(canvas) {
        super();
        this.canvas = canvas;
        
        // Key states
        this.keys = {};
        this.mousePosition = { x: 0, y: 0 };
        this.mouseDown = false;
        
        // Key mappings
        this.keyMap = {
            'KeyW': 'moveForward',
            'ArrowUp': 'moveForward',
            'KeyS': 'moveBackward',
            'ArrowDown': 'moveBackward',
            'KeyA': 'turnLeft',
            'ArrowLeft': 'turnLeft',
            'KeyD': 'turnRight',
            'ArrowRight': 'turnRight',
            'Space': 'layMine',
            'KeyM': 'layMine',
            'Tab': 'showScores',
            'Enter': 'openChat',
            'Escape': 'menu'
        };
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // Keyboard events
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        document.addEventListener('keyup', (e) => this.handleKeyUp(e));
        
        // Mouse events
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        
        // Touch events for mobile
        this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e));
        this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e));
        this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e));
        
        // Prevent right-click menu
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            return false;
        });
    }
    
    handleKeyDown(event) {
        // Ignore if typing in chat
        if (event.target.tagName === 'INPUT') return;
        
        const key = event.code;
        
        // Prevent repeat events
        if (this.keys[key]) return;
        
        this.keys[key] = true;
        
        // Map to action
        const action = this.keyMap[key];
        if (action) {
            event.preventDefault();
            this.dispatchEvent(new CustomEvent(action, { detail: { pressed: true } }));
        }
    }
    
    handleKeyUp(event) {
        const key = event.code;
        this.keys[key] = false;
        
        // Map to action
        const action = this.keyMap[key];
        if (action) {
            event.preventDefault();
            this.dispatchEvent(new CustomEvent(action + 'Released', { detail: { pressed: false } }));
        }
    }
    
    handleMouseMove(event) {
        const rect = this.canvas.getBoundingClientRect();
        this.mousePosition = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };
        
        this.dispatchEvent(new CustomEvent('mouseMove', { 
            detail: this.mousePosition 
        }));
    }
    
    handleMouseDown(event) {
        event.preventDefault();
        
        this.mouseDown = true;
        const rect = this.canvas.getBoundingClientRect();
        const position = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };
        
        if (event.button === 0) { // Left click
            this.dispatchEvent(new CustomEvent('fire', { 
                detail: position 
            }));
        } else if (event.button === 2) { // Right click
            this.dispatchEvent(new CustomEvent('layMine', { 
                detail: position 
            }));
        }
    }
    
    handleMouseUp(event) {
        this.mouseDown = false;
    }
    
    handleTouchStart(event) {
        event.preventDefault();
        
        if (event.touches.length > 0) {
            const touch = event.touches[0];
            const rect = this.canvas.getBoundingClientRect();
            const position = {
                x: touch.clientX - rect.left,
                y: touch.clientY - rect.top
            };
            
            // Simulate mouse click for touch
            this.dispatchEvent(new CustomEvent('fire', { 
                detail: position 
            }));
            
            this.touchStartPos = position;
        }
    }
    
    handleTouchMove(event) {
        event.preventDefault();
        
        if (event.touches.length > 0 && this.touchStartPos) {
            const touch = event.touches[0];
            const rect = this.canvas.getBoundingClientRect();
            const position = {
                x: touch.clientX - rect.left,
                y: touch.clientY - rect.top
            };
            
            // Calculate swipe direction for movement
            const dx = position.x - this.touchStartPos.x;
            const dy = position.y - this.touchStartPos.y;
            
            if (Math.abs(dx) > 50) {
                if (dx > 0) {
                    this.dispatchEvent(new CustomEvent('turnRight', { detail: { pressed: true } }));
                } else {
                    this.dispatchEvent(new CustomEvent('turnLeft', { detail: { pressed: true } }));
                }
            }
            
            if (Math.abs(dy) > 50) {
                if (dy > 0) {
                    this.dispatchEvent(new CustomEvent('moveBackward', { detail: { pressed: true } }));
                } else {
                    this.dispatchEvent(new CustomEvent('moveForward', { detail: { pressed: true } }));
                }
            }
        }
    }
    
    handleTouchEnd(event) {
        this.touchStartPos = null;
        
        // Stop all movement
        ['moveForward', 'moveBackward', 'turnLeft', 'turnRight'].forEach(action => {
            this.dispatchEvent(new CustomEvent(action + 'Released', { detail: { pressed: false } }));
        });
    }
    
    isKeyPressed(keyCode) {
        return this.keys[keyCode] || false;
    }
    
    getMousePosition() {
        return this.mousePosition;
    }
    
    isMouseDown() {
        return this.mouseDown;
    }
}

export { InputManager };
