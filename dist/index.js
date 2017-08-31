/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
* File Name   : index.js
* Created at  : 2017-07-31
* Updated at  : 2017-08-31
* Author      : jeefo
* Purpose     :
* Description :
_._._._._._._._._._._._._._._._._._._._._.*/

var $q           = require("jeefo_q"),
	polifyll     = require("jeefo_polyfill"),
	array_remove = require("jeefo_utils/array/remove");

var set_timeout = setTimeout;

// shim layer with setTimeout fallback
var RAF = polifyll("requestAnimationFrame", function (callback) {
	return set_timeout(callback, 16.66);
});

var CANCEL_RAF = polifyll("cancelAnimationFrame", function (id) {
	clearTimeout(id);
});

var convert_timing = function (value) {
	return +(value.substring(0, value.length - 1));
};

var Flags = function (computed_style) {
	this.has_animations  = computed_style.animation_duration  > 0;
	this.has_transitions = computed_style.transition_duration > 0;
};

var parse_timing = function (computed_style) {
	var timings = {
		animation_duration  : convert_timing(computed_style.animationDuration),
		transition_duration : convert_timing(computed_style.transitionDuration),
	};

	timings.max_duration = Math.max(timings.animation_duration, timings.transition_duration);

	return timings;
};

var animators_container = [];

var Animator = function ($element) {
	this.$element = $element;
};
Animator.prototype = {
	start : function () {
		var self = this, timings;
		self.prepare();

		if (self.events) {
			timings           = self.timings;
			self.deferred     = $q.defer();
			self.is_animating = true;
			self.active();

			if (self.$element[0].offsetWidth === 0 && self.$element[0].offsetHeight === 0) {
				self.destroy();
				self.deferred.reject("invisible");
			} else {
				self.event_handler = self.$element.on(self.events, event_handler);
			}

			return self.deferred.promise;
		}

		// jshint latedef : false
		return $q.when();

		function event_handler (event) {
			event.stopPropagation();
			if (event.target !== this) {
				return;
			}

			/**
			 * Firefox (or possibly just Gecko) likes to not round values up
			 * when a ms measurement is used for the animation.
			 **/
			var elapsed_time = parseFloat(event.elapsedTime.toFixed(3));

			/**
			 * TIME -----*-----*---------------------*-------------->
			 *           A     B                     C
			 *
			 * A - Point when animation activated.
			 * B - Point when actual animation started.
			 * C - Elapsed time.
			 *
			 * Delay    = (B - A)
			 * Duration = (C - B)
			 *
			 * We now always use `Date.now()` for current time.
			 * Because of the recent changes with
			 * event.timeStamp in Firefox, Webkit and Chrome (see #13494 for more info)
			 **/
			if (Math.max(Date.now() - timings.started_at, 0) >= timings.max_delay && elapsed_time >= timings.max_duration) {
				self.destroy();
				self.deferred.resolve();
			}
		}
		// jshint latedef : true
	},
	destroy : function () {
		if (this.is_animating) {
			if (this.flags.has_stagger) {
				this.$element[0].style.transitionDelay = this.transition_delay;
			}
			this.is_animating = false;
			array_remove(animators_container, this);
			this.$element.off(this.events, this.event_handler);
			this.events = this.event_handler = null;
			CANCEL_RAF(this.raf_id);
		}
	},
	cancel : function () {
		this.destroy();
		this.deferred.reject();
	},
};

var get_animator = function ($element) {
	var i = animators_container.length;
	while (i--) {
		if (animators_container[i].$element[0] === $element[0]) {
			return animators_container[i];
		}
	}

	animators_container.push(new Animator($element));
	return animators_container[animators_container.length - 1];
};

var class_based_animation = function (
	$element,
	initial_class_name,
	stagger_class_name,
	active_class_name,
	stagger_index
) {
	var animator = get_animator($element), computed_style;

	if (! animator.is_animating) {
		animator.transition_delay = $element[0].style.transitionDelay;
		$element[0].style.transitionDelay = "-9999s";
	}

	animator.prepare = function () {
		this.$element.add_class(initial_class_name);
		if (animator.is_animating) {
			animator.cancel();
		}

		computed_style = window.getComputedStyle(this.$element[0]);
		this.timings   = parse_timing(computed_style);

		this.flags = new Flags(this.timings);
		this.flags.has_stagger = stagger_index !== void 0;

		var events = [];
		if (this.flags.has_animations) {
			events[events.length] = "animationend";
		}
		if (this.flags.has_transitions) {
			events[events.length] = "transitionend";
		}
		if (events.length) {
			this.events = events;
		} else {
			this.$element[0].style.transitionDelay = this.transition_delay;
		}
	};

	animator.active = function () {
		var self = this;
		self.raf_id = RAF(function () {
			self.$element[0].style.transitionDelay = self.transition_delay;

			if (self.flags.has_stagger) {
				self.$element.add_class(stagger_class_name);
				var delay = convert_timing(computed_style.transitionDelay) * stagger_index;
				self.$element[0].style.transitionDelay = delay + 's';
				self.timings.max_delay  = delay * 1000;
			} else {
				self.timings.max_delay  = convert_timing(computed_style.transitionDelay) * 1000;
			}

			self.timings.started_at = Date.now();
			self.$element.replace_class(stagger_class_name, active_class_name);
		});
	};

	return animator;
};

module.exports = {
	enter : function ($element, stagger_index) {
		return class_based_animation(
			$element,
			"jf-enter",
			"jf-enter-stagger",
			"jf-enter-active",
			stagger_index
		).start().$finally(function () {
			$element.remove_class("jf-enter", "jf-enter-active");
		});
	},
	leave : function ($element, stagger_index) {
		return class_based_animation(
			$element,
			"jf-leave",
			"jf-leave-stagger",
			"jf-leave-active",
			stagger_index
		).start();
	},
};
