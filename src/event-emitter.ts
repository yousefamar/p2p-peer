// TODO: Use three.js' built-in implementation instead?
export default class EventEmitter {
	listeners: any;

	constructor() {
		this.listeners = {};
	}

	on(event: string, callback: Function) {
		this.listeners[event] = this.listeners[event] || [];
		this.listeners[event].push(callback);
	}

	removeListener(event: string, callback: Function) {
		this.listeners[event] = this.listeners[event] || [];

		let id = this.listeners[event].indexOf(callback);
		if (id < 0)
			return;

		this.listeners[event].splice(id, 1);
	}

	emit(event: string, ...data: any[]) {
		this.listeners[event] = this.listeners[event] || [];

		// TODO: Wrap in try-catch
		for (let callback of this.listeners[event])
			callback(...data);
	}
}
