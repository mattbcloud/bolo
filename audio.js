// audio.js - Audio Manager for Bolo
class AudioManager {
    constructor() {
        this.sounds = {};
        this.enabled = true;
        this.volume = 0.5;
        
        // Audio context for Web Audio API
        this.audioContext = null;
        this.masterGain = null;
        
        this.init();
    }
    
    init() {
        // Initialize Web Audio API
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContext();
            
            // Create master gain node
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = this.volume;
            this.masterGain.connect(this.audioContext.destination);
            
            // Resume audio context on user interaction (Chrome policy)
            document.addEventListener('click', () => {
                if (this.audioContext.state === 'suspended') {
                    this.audioContext.resume();
                }
            }, { once: true });
            
        } catch (error) {
            console.warn('Web Audio API not supported:', error);
            this.enabled = false;
        }
        
        // Generate procedural sounds
        this.generateSounds();
    }
    
    generateSounds() {
        // Generate simple sound effects procedurally
        // This avoids need for external audio files
        
        this.sounds = {
            fire: () => this.playTone(200, 0.1, 'sawtooth'),
            explosion: () => this.playNoise(0.3),
            hit: () => this.playTone(100, 0.1, 'square'),
            mine: () => this.playTone(400, 0.05, 'sine'),
            pickup: () => this.playTone(800, 0.1, 'sine'),
            gameStart: () => this.playMelody([440, 550, 660], 0.1),
            respawn: () => this.playMelody([330, 440, 550], 0.1),
            warning: () => this.playTone(300, 0.2, 'triangle'),
            click: () => this.playTone(1000, 0.02, 'sine')
        };
    }
    
    playTone(frequency, duration, type = 'sine') {
        if (!this.enabled || !this.audioContext) return;
        
        try {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.type = type;
            oscillator.frequency.value = frequency;
            
            // Envelope
            gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.3, this.audioContext.currentTime + 0.01);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);
            
            oscillator.connect(gainNode);
            gainNode.connect(this.masterGain);
            
            oscillator.start();
            oscillator.stop(this.audioContext.currentTime + duration);
            
        } catch (error) {
            console.warn('Error playing tone:', error);
        }
    }
    
    playNoise(duration) {
        if (!this.enabled || !this.audioContext) return;
        
        try {
            const bufferSize = this.audioContext.sampleRate * duration;
            const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
            const output = buffer.getChannelData(0);
            
            // Generate white noise
            for (let i = 0; i < bufferSize; i++) {
                output[i] = Math.random() * 2 - 1;
            }
            
            const noise = this.audioContext.createBufferSource();
            const gainNode = this.audioContext.createGain();
            
            noise.buffer = buffer;
            
            // Envelope for explosion
            gainNode.gain.setValueAtTime(0.5, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);
            
            // Add low-pass filter for rumble
            const filter = this.audioContext.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 200;
            
            noise.connect(filter);
            filter.connect(gainNode);
            gainNode.connect(this.masterGain);
            
            noise.start();
            noise.stop(this.audioContext.currentTime + duration);
            
        } catch (error) {
            console.warn('Error playing noise:', error);
        }
    }
    
    playMelody(frequencies, noteDuration) {
        if (!this.enabled || !this.audioContext) return;
        
        frequencies.forEach((freq, index) => {
            setTimeout(() => {
                this.playTone(freq, noteDuration, 'sine');
            }, index * noteDuration * 1000);
        });
    }
    
    play(soundName) {
        if (!this.enabled) return;
        
        const sound = this.sounds[soundName];
        if (sound) {
            sound();
        } else {
            console.warn(`Sound '${soundName}' not found`);
        }
    }
    
    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
        
        if (this.masterGain) {
            this.masterGain.gain.value = this.volume;
        }
    }
    
    setEnabled(enabled) {
        this.enabled = enabled;
        
        if (!enabled && this.audioContext) {
            this.audioContext.suspend();
        } else if (enabled && this.audioContext) {
            this.audioContext.resume();
        }
    }
    
    toggle() {
        this.setEnabled(!this.enabled);
    }
}

export { AudioManager };
