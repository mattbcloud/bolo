/**
 * Simple EventEmitter implementation for browser compatibility
 */
type EventListener = (...args: any[]) => void;
export declare class EventEmitter {
    private events;
    on(event: string, listener: EventListener): this;
    once(event: string, listener: EventListener): this;
    off(event: string, listener: EventListener): this;
    emit(event: string, ...args: any[]): boolean;
    removeAllListeners(event?: string): this;
}
export default EventEmitter;
//# sourceMappingURL=event-emitter.d.ts.map