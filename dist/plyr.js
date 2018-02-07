// ==========================================================================
// Plyr
// plyr.js v2.0.9
// https://github.com/selz/plyr
// License: The MIT License (MIT)
// ==========================================================================
// Credits: http://paypal.github.io/accessible-html5-video-player/
// ==========================================================================

;(function(root, factory) {
    'use strict';
    /* global define,module */

    if (typeof module === 'object' && typeof module.exports === 'object') {
        // Node, CommonJS-like
        module.exports = factory(root, document);
    } else if (typeof define === 'function' && define.amd) {
        // AMD
        define([], function () { return factory(root, document); });
    } else {
        // Browser globals (root is window)
        root.plyr = factory(root, document);
    }
}(typeof window !== 'undefined' ? window : this, function(window, document) {
    'use strict';

    // Globals
    var scroll = { x: 0, y: 0 };

    // Default config
    var defaults = {
        enabled:                true,
        debug:                  false,
        autoplay:               false,
        loop:                   false,
        seekTime:               10,
        volume:                 10,
        volumeMin:              0,
        volumeMax:              10,
        volumeStep:             1,
        defaultSpeed:           1.0,
        currentSpeed:           1.0,
        speeds:                 [ 0.5, 1.0, 1.5, 2.0 ],
        duration:               null,
        displayDuration:        true,
        loadSprite:             true,
        iconPrefix:             'plyr',
        iconUrl:                _currentScript().src.substring(0, _currentScript().src.lastIndexOf('/') + 1) + 'plyr.svg',
        clickToPlay:            true,
        hideControls:           true,
        showPosterOnEnd:        false,
        showThumbnails:         false,
        disableContextMenu:     true,
        showAdBreakMarkers:     true,
        disableSeekDuringAdBreak: true,
        keyboardShorcuts:       {
            focused:            true,
            global:             false
        },
        tooltips: {
            controls:           true,
            seek:               true
        },
        selectors: {
            html5:              'video, audio',
            embed:              '[data-type]',
            editable:           'input, textarea, select, [contenteditable]',
            container:          '.plyr',
            controls: {
                container:      null,
                wrapper:        '.plyr__controls'
            },
            labels:             '[data-plyr]',
            buttons: {
                seek:           '[data-plyr="seek"]',
                play:           '[data-plyr="play"]',
                pause:          '[data-plyr="pause"]',
                restart:        '[data-plyr="restart"]',
                rewind:         '[data-plyr="rewind"]',
                forward:        '[data-plyr="fast-forward"]',
                mute:           '[data-plyr="mute"]',
                captions:       '[data-plyr="captions"]',
                fullscreen:     '[data-plyr="fullscreen"]',
                settings:       '[data-plyr="settings"]',
                pip:            '[data-plyr="pip"]',
                airplay:        '[data-plyr="airplay"]'
            },
            volume: {
                input:          '[data-plyr="volume"]',
                display:        '.plyr__volume--display'
            },
            progress: {
                container:      '.plyr__progress',
                buffer:         '.plyr__progress--buffer',
                played:         '.plyr__progress--played',
                seek: {
                    container:  '.plyr__tooltip--container',
                    tooltip:    '.plyr__tooltip--time',
                    thumbnail:  '.plyr__tooltip--thumbnail'
                },
            },
            captions:           '.plyr__captions',
            currentTime:        '.plyr__time--current',
            duration:           '.plyr__time--duration',
            adDuration:         '.plyr__time--ad-duration',
            settings: {
                captions:          '[data-plyr="settings-captions"]',
                audio:             '[data-plyr="settings-audio"]',
                font:              '[data-plyr="settings-font"]',
                fontColor:         '[data-plyr="settings-fontColor"]',
                fontSize:          '[data-plyr="settings-fontSize"]',
                fontOpacity:       '[data-plyr="settings-fontOpacity"]',
                fontStyle:         '[data-plyr="settings-fontStyle"]',
                backgroundColor:   '[data-plyr="settings-backgroundColor"]',
                backgroundOpacity: '[data-plyr="settings-backgroundOpacity"]',
                windowColor:       '[data-plyr="settings-windowColor"]',
                windowOpacity:     '[data-plyr="settings-windowOpacity"]',
            }
        },
        classes: {
            setup:              'plyr--setup',
            ready:              'plyr--ready',
            videoWrapper:       'plyr__video-wrapper',
            embedWrapper:       'plyr__video-embed',
            type:               'plyr--{0}',
            stopped:            'plyr--stopped',
            playing:            'plyr--playing',
            muted:              'plyr--muted',
            loading:            'plyr--loading',
            hover:              'plyr--hover',
            tooltip:            'plyr__tooltip',
            hidden:             'plyr__sr-only',
            hideControls:       'plyr--hide-controls',
            hideAdOverlay:      'plyr--hide-ad-overlay',
            hideSeekButton:     'plyr--hide-seek-button',
            hideProgress:       'plyr__progress--hidden',
            isIos:              'plyr--is-ios',
            isTouch:            'plyr--is-touch',
            captions: {
                enabled:        'plyr--captions-enabled',
                active:         'plyr--captions-active'
            },
            fullscreen: {
                enabled:        'plyr--fullscreen-enabled',
                active:         'plyr--fullscreen-active'
            },
            pip: {
                enabled:        'plyr--pip-enabled',
                active:         'plyr--pip-active'
            },
            tabFocus:           'tab-focus'
        },
        captions: {
            defaultActive:      true,
            selectedIndex:      -1
        },
        fullscreen: {
            enabled:            true,
            fallback:           true,
            allowAudio:         false
        },
        storage: {
            enabled:            true,
            key:                'plyr'
        },
        controls:               ['play-large', 'play', 'progress', 'current-time', 'duration', 'mute', 'volume', 'settings', 'pip', /*'airplay',*/ 'fullscreen'],
        i18n: {
            restart:               'Restart',
            rewind:                'Rewind {seektime} secs',
            play:                  'Play',
            pause:                 'Pause',
            forward:               'Forward {seektime} secs',
            played:                'played',
            buffered:              'buffered',
            currentTime:           'Current time',
            duration:              'Duration',
            volume:                'Volume',
            toggleMute:            'Toggle Mute',
            toggleCaptions:        'Toggle Captions',
            toggleFullscreen:      'Toggle Fullscreen',
            frameTitle:            'Player for {title}',
            captions:              'Captions',
            settings:              'Settings',
            speed:                 'Speed',
            quality:               'Quality',
            adDuration:            'Ad Duration',
            adClick:               'More Info',
            audio:                 'Audio',
            captionStyle:          'Caption Style',
            font:                  'Font',
            fontSize:              'Font Size',
            fontStyle:             'Font Style',
            fontColor:             'Font Color',
            fontOpacity:           'Font Opacity',
            backgroundColor:       'Background Color',
            backgroundOpacity:     'Background Opacity',
            windowColor:           'Window Color',
            windowOpacity:         'Window Opacity',
            monoSerif:             'Mono serif',
            proportionalSerif:     'Proportional serif',
            monoSansSerif:         'Mono sans serif',
            proportionalSansSerif: 'Proportional sans serif',
            casual:                'Casual',
            cursive:               'Cursive',
            smallCaps:             'Small caps',
            white:                 'White',
            black:                 'Black',
            red:                   'Red',
            green:                 'Green',
            blue:                  'Blue',
            yellow:                'Yellow',
            magenta:               'Magenta',
            cyan:                  'Cyan',
            opaque:                'Opaque',
            translucent:           'Translucent',
            semitransparent:       'Semitransparent',
            transparent:           'Transparent',
            none:                  'None',
            raised:                'Raised',
            depressed:             'Depressed',
            uniform:               'Uniform',
            dropShadow:            'Drop Shadow',
            english:               'English',
            german:                'German',
            spanish:               'Spanish',
            french:                'French',
            italian:               'Italian',
            dutch:                 'Dutch',
            polish:                'Polish',
            portuguese:            'Portuguese',
            russian:               'Russian',
            vietnamese:            'Vietnamese',
            danish:                'Danish',
            chinese:               'Chinese',
            swedish:               'Swedish',
            thai:                  'Thai'
        },
        types: {
            embed:              ['youtube', 'vimeo', 'soundcloud'],
            html5:              ['video', 'audio']
        },
        // URLs
        urls: {
            vimeo: {
                api:            'https://player.vimeo.com/api/player.js',
            },
            youtube: {
                api:            'https://www.youtube.com/iframe_api'
            },
            soundcloud: {
                api:            'https://w.soundcloud.com/player/api.js'
            }
        },
        // Custom control listeners
        listeners: {
            seek:               null,
            play:               null,
            pause:              null,
            restart:            null,
            rewind:             null,
            forward:            null,
            mute:               null,
            volume:             null,
            captions:           null,
            fullscreen:         null,
            speed:              null
        },
        // Events to watch on HTML5 media elements
        events:                 ['ready', 'ended', 'progress', 'stalled', 'playing', 'waiting', 'canplay', 'canplaythrough', 'loadstart', 'loadeddata', 'loadedmetadata', 'timeupdate', 'volumechange', 'play', 'pause', 'error', 'seeking', 'emptied'],
        // Logging
        logPrefix:              '[Plyr]'
    };

    function _currentScript() {
        //hacky, but works for our needs
        var scripts = document.getElementsByTagName('script');
        if (scripts && scripts.length) {
            for (var i = 0; i < scripts.length; i++) {
                if (scripts[i].src.indexOf('plyr.js') > -1 || scripts[i].src.indexOf('plyr.min.js') > -1) {
                    return scripts[i];
                }
            }
        }

        return undefined;
    }

    // Credits: http://paypal.github.io/accessible-html5-video-player/
    // Unfortunately, due to mixed support, UA sniffing is required
    function _getBrowser() {
        var ua = navigator.userAgent,
            name = navigator.appName,
            fullVersion = '' + parseFloat(navigator.appVersion),
            majorVersion = parseInt(navigator.appVersion, 10),
            nameOffset,
            verOffset,
            ix,
            isIE = false,
            isEdge = false,
            isFirefox = false,
            isChrome = false,
            isSafari = false;

        if ((navigator.appVersion.indexOf('Windows NT') !== -1) && (navigator.appVersion.indexOf('rv:11') !== -1)) {
            // MSIE 11
            isIE = true;
            name = 'IE';
            fullVersion = '11';
        } else if ((verOffset = ua.indexOf('MSIE')) !== -1) {
            // MSIE
            isIE = true;
            name = 'IE';
            fullVersion = ua.substring(verOffset + 5);
        } else if ((verOffset = ua.indexOf('Edge')) !== -1) {
            // MS Edge
            isEdge = true;
            name = 'Edge';
            fullVersion = ua.substring(verOffset + 5);
        } else if ((verOffset = ua.indexOf('Chrome')) !== -1) {
            // Chrome
            isChrome = true;
            name = 'Chrome';
            fullVersion = ua.substring(verOffset + 7);
        } else if ((verOffset = ua.indexOf('Safari')) !== -1) {
            // Safari
            isSafari = true;
            name = 'Safari';
            fullVersion = ua.substring(verOffset + 7);
            if ((verOffset = ua.indexOf('Version')) !== -1) {
                fullVersion = ua.substring(verOffset + 8);
            }
        } else if ((verOffset = ua.indexOf('Firefox')) !== -1) {
            // Firefox
            isFirefox = true;
            name = 'Firefox';
            fullVersion = ua.substring(verOffset + 8);
        } else if ((nameOffset = ua.lastIndexOf(' ') + 1) < (verOffset = ua.lastIndexOf('/'))) {
            // In most other browsers, 'name/version' is at the end of userAgent
            name = ua.substring(nameOffset,verOffset);
            fullVersion = ua.substring(verOffset + 1);

            if (name.toLowerCase() === name.toUpperCase()) {
                name = navigator.appName;
            }
        }

        // Trim the fullVersion string at semicolon/space if present
        if ((ix = fullVersion.indexOf(';')) !== -1) {
            fullVersion = fullVersion.substring(0, ix);
        }
        if ((ix = fullVersion.indexOf(' ')) !== -1) {
            fullVersion = fullVersion.substring(0, ix);
        }

        // Get major version
        majorVersion = parseInt('' + fullVersion, 10);
        if (isNaN(majorVersion)) {
            fullVersion = '' + parseFloat(navigator.appVersion);
            majorVersion = parseInt(navigator.appVersion, 10);
        }

        // Return data
        return {
            name:       name,
            version:    majorVersion,
            isIE:       isIE,
            isEdge:     isEdge,
            isFirefox:  isFirefox,
            isChrome:   isChrome,
            isSafari:   isSafari,
            isIos:      /(iPad|iPhone|iPod)/gi.test(navigator.platform),
            isTouch:    'ontouchstart' in document.documentElement
        };
    }

    // Inject a script
    function _injectScript(source) {
        if (document.querySelectorAll('script[src="' + source + '"]').length) {
            return;
        }

        var tag = document.createElement('script');
        tag.src = source;
        var firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    }

    // Element exists in an array
    function _inArray(haystack, needle) {
        return Array.prototype.indexOf && (haystack.indexOf(needle) !== -1);
    }

    // Replace all
    function _replaceAll(string, find, replace) {
        return string.replace(new RegExp(find.replace(/([.*+?\^=!:${}()|\[\]\/\\])/g, '\\$1'), 'g'), replace);
    }

    // Wrap an element
    function _wrap(elements, wrapper) {
        // Convert `elements` to an array, if necessary.
        if (!elements.length) {
            elements = [elements];
        }

        // Loops backwards to prevent having to clone the wrapper on the
        // first element (see `child` below).
        for (var i = elements.length - 1; i >= 0; i--) {
            var child   = (i > 0) ? wrapper.cloneNode(true) : wrapper;
            var element = elements[i];

            // Cache the current parent and sibling.
            var parent  = element.parentNode;
            var sibling = element.nextSibling;

            // Wrap the element (is automatically removed from its current
            // parent).
            child.appendChild(element);

            // If the element had a sibling, insert the wrapper before
            // the sibling to maintain the HTML structure; otherwise, just
            // append it to the parent.
            if (sibling) {
                parent.insertBefore(child, sibling);
            } else {
                parent.appendChild(child);
            }

            return child;
        }
    }

    // Remove an element
    function _remove(element) {
        if (!element) {
            return;
        }
        element.parentNode.removeChild(element);
    }

    // Prepend child
    function _prependChild(parent, element) {
        parent.insertBefore(element, parent.firstChild);
    }

    // Set attributes
    function _setAttributes(element, attributes) {
        for (var key in attributes) {
            element.setAttribute(key, (_is.boolean(attributes[key]) && attributes[key]) ? '' : attributes[key]);
        }
    }

    // Insert a HTML element
    function _insertElement(type, parent, attributes) {
        // Create a new <element>
        var element = document.createElement(type);

        // Set all passed attributes
        _setAttributes(element, attributes);

        // Inject the new element
        _prependChild(parent, element);
    }

    // Get a classname from selector
    function _getClassname(selector) {
        return selector.replace('.', '');
    }

    // Toggle class on an element
    function _toggleClass(element, className, state) {
        if (element) {
            if (element.classList) {
                element.classList[state ? 'add' : 'remove'](className);
            } else {
                var name = (' ' + element.className + ' ').replace(/\s+/g, ' ').replace(' ' + className + ' ', '');
                element.className = name + (state ? ' ' + className : '');
            }
        }
    }

    // Has class name
    function _hasClass(element, className) {
        if (element) {
            if (element.classList) {
                return element.classList.contains(className);
            } else {
                return new RegExp('(\\s|^)' + className + '(\\s|$)').test(element.className);
            }
        }
        return false;
    }

    // Element matches selector
    function _matches(element, selector) {
        var p = Element.prototype;

        var f = p.matches || p.webkitMatchesSelector || p.mozMatchesSelector || p.msMatchesSelector || function(s) {
            return [].indexOf.call(document.querySelectorAll(s), this) !== -1;
        };

        return f.call(element, selector);
    }

    // Bind along with custom handler
    function _proxyListener(element, eventName, userListener, defaultListener, useCapture) {
        _on(element, eventName, function(event) {
            if (userListener) {
                userListener.apply(element, [event]);
            }
            defaultListener.apply(element, [event]);
        }, useCapture);
    }

    // Toggle event listener
    function _toggleListener(elements, events, callback, toggle, useCapture) {
        var eventList = events.split(' ');

        // Whether the listener is a capturing listener or not
        // Default to false
        if (!_is.boolean(useCapture)) {
            useCapture = false;
        }

        // If a nodelist is passed, call itself on each node
        if (elements instanceof NodeList) {
            for (var x = 0; x < elements.length; x++) {
                if (elements[x] instanceof Node) {
                    _toggleListener(elements[x], arguments[1], arguments[2], arguments[3]);
                }
            }
            return;
        }

        // If a single node is passed, bind the event listener
        for (var i = 0; i < eventList.length; i++) {
            elements[toggle ? 'addEventListener' : 'removeEventListener'](eventList[i], callback, useCapture);
        }
    }

    // Bind event handler
    function _on(element, events, callback, useCapture) {
        if (!_is.undefined(element)) {
            _toggleListener(element, events, callback, true, useCapture);
        }
    }

    // Unbind event handler
    function _off(element, events, callback, useCapture) {
        if (!_is.undefined(element)) {
            _toggleListener(element, events, callback, false, useCapture);
        }
    }

    // Trigger event
    function _event(element, type, bubbles, properties) {
        // Bail if no element
        if (!element || !type) {
            return;
        }

        // Default bubbles to false
        if (!_is.boolean(bubbles)) {
            bubbles = false;
        }

        // Create and dispatch the event
        var event = new CustomEvent(type, {
            bubbles:    bubbles,
            detail:     properties
        });

        // Dispatch the event
        element.dispatchEvent(event);
    }

    // Toggle aria-pressed state on a toggle button
    // http://www.ssbbartgroup.com/blog/how-not-to-misuse-aria-states-properties-and-roles
    function _toggleState(target, state) {
        // Bail if no target
        if (!target) {
            return;
        }

        // Get state
        state = (_is.boolean(state) ? state : !target.getAttribute('aria-pressed'));

        // Set the attribute on target
        target.setAttribute('aria-pressed', state);

        return state;
    }

    // Get percentage
    function _getPercentage(current, max) {
        if (current === 0 || max === 0 || isNaN(current) || isNaN(max)) {
            return 0;
        }
        return ((current / max) * 100).toFixed(2);
    }

    // Deep extend/merge destination object with N more objects
    // http://andrewdupont.net/2009/08/28/deep-extending-objects-in-javascript/
    // Removed call to arguments.callee (used explicit function name instead)
    function _extend() {
        // Get arguments
        var objects = arguments;

        // Bail if nothing to merge
        if (!objects.length) {
            return;
        }

        // Return first if specified but nothing to merge
        if (objects.length === 1) {
            return objects[0];
        }

        // First object is the destination
        var destination = Array.prototype.shift.call(objects),
            length      = objects.length;

        // Loop through all objects to merge
        for (var i = 0; i < length; i++) {
            var source = objects[i];

            for (var property in source) {
                if (source[property] && source[property].constructor && source[property].constructor === Object) {
                    destination[property] = destination[property] || {};
                    _extend(destination[property], source[property]);
                } else {
                    destination[property] = source[property];
                }
            }
        }

        return destination;
    }

    // Check variable types
    var _is = {
        object: function(input) {
            return input !== null && typeof(input) === 'object' && input.constructor === Object;
        },
        array: function(input) {
            return input !== null && typeof(input) === 'object' && input.constructor === Array;
        },
        number: function(input) {
            return input !== null && (typeof(input) === 'number' && !isNaN(input - 0) || (typeof input === 'object' && input.constructor === Number));
        },
        string: function(input) {
            return input !== null && (typeof input === 'string' || (typeof input === 'object' && input.constructor === String));
        },
        boolean: function(input) {
            return input !== null && typeof input === 'boolean';
        },
        nodeList: function(input) {
            return input !== null && input instanceof NodeList;
        },
        htmlElement: function(input) {
            return input !== null && input instanceof HTMLElement;
        },
        function: function(input) {
            return input !== null && typeof input === 'function';
        },
        event: function(input) {
            return input !== null && typeof input === 'object' && (input.constructor === Event || input.constructor === CustomEvent);
        },
        undefined: function(input) {
            return input !== null && typeof input === 'undefined';
        },
        empty: function(input) {
            return input === null || this.undefined(input) || ((this.string(input) || this.array(input) || this.nodeList(input)) && input.length === 0) || (this.object(input) && Object.keys(input).length === 0);
        }
    };

    // Fullscreen API
    var _fullscreen;
    (function() {
        // Determine the prefix
        var prefix = (function() {
            var value = false;

            if (_is.function(document.cancelFullScreen)) {
                value = '';
            } else {
                // Check for fullscreen support by vendor prefix
                ['webkit', 'o', 'moz', 'ms', 'khtml'].some(function(prefix) {
                    if (_is.function(document[prefix + 'CancelFullScreen'])) {
                        value = prefix;
                        return true;
                    } else if (_is.function(document.msExitFullscreen) && document.msFullscreenEnabled) {
                        // Special case for MS (when isn't it?)
                        value = 'ms';
                        return true;
                    }
                });
            }

            return value;
        })();

        _fullscreen = {
            // Yet again Microsoft awesomeness,
            // Sometimes the prefix is 'ms', sometimes 'MS' to keep you on your toes
            eventType: (prefix === 'ms' ? 'MSFullscreenChange' : prefix + 'fullscreenchange'),

            // Is an element fullscreen
            isFullScreen: function(element) {
                if (!_support.fullscreen) {
                    return false;
                }
                if (_is.undefined(element)) {
                    element = document.body;
                }
                switch (prefix) {
                    case '':
                        return document.fullscreenElement === element;
                    case 'moz':
                        return document.mozFullScreenElement === element;
                    default:
                        return document[prefix + 'FullscreenElement'] === element;
                }
            },
            requestFullScreen: function(element) {
                if (!_support.fullscreen) {
                    return false;
                }
                if (!_is.htmlElement(element)) {
                    element = document.body;
                }

                return (prefix === '') ? element.requestFullScreen() : element[prefix + (prefix === 'ms' ? 'RequestFullscreen' : 'RequestFullScreen')]();
            },
            cancelFullScreen: function() {
                if (!_support.fullscreen) {
                    return false;
                }
                return (prefix === '') ? document.cancelFullScreen() : document[prefix + (prefix === 'ms' ? 'ExitFullscreen' : 'CancelFullScreen')]();
            },
            element: function() {
                if (!_support.fullscreen) {
                    return null;
                }
                return (prefix === '') ? document.fullscreenElement : document[prefix + 'FullscreenElement'];
            }
        };
    })();

    // Check for support
    var _support = {
        // Fullscreen support and set prefix
        fullscreen: _fullscreen.prefix !== false,
        // Local storage mode
        // We can't assume if local storage is present that we can use it
        storage: (function() {
            if (!('localStorage' in window)) {
                return false;
            }

            // Try to use it (it might be disabled, e.g. user is in private/porn mode)
            // see: https://github.com/Selz/plyr/issues/131
            try {
                // Add test item
                window.localStorage.setItem('___test', 'OK');

                // Get the test item
                var result = window.localStorage.getItem('___test');

                // Clean up
                window.localStorage.removeItem('___test');

                // Check if value matches
                return (result === 'OK');
            }
            catch (e) {
                return false;
            }
        })(),
        // Picture-in-picture support
        // Safari only currently
        pip: (function() {
            return _is.function(document.createElement('video').webkitSetPresentationMode);
        })(),
        // Airplay support
        // Safari only currently
        airplay: (function() {
            return _is.function(window.WebKitPlaybackTargetAvailabilityEvent);
        })(),
        // Check for mime type support against a player instance
        // Credits: http://diveintohtml5.info/everything.html
        // Related: http://www.leanbackplyr.com/test/h5mt.html
        mime: function(plyr, type) {
            var media = plyr.media;

            try {
                // Bail if no checking function
                if (!_is.function(media.canPlayType)) {
                    return false;
                }

                // Type specific checks
                if (plyr.type === 'video') {
                    switch (type) {
                        case 'video/webm':   return media.canPlayType('video/webm; codecs="vp8, vorbis"').replace(/no/, '');
                        case 'video/mp4':    return media.canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"').replace(/no/, '');
                        case 'video/ogg':    return media.canPlayType('video/ogg; codecs="theora"').replace(/no/, '');
                    }
                } else if (plyr.type === 'audio') {
                    switch (type) {
                        case 'audio/mpeg':   return media.canPlayType('audio/mpeg;').replace(/no/, '');
                        case 'audio/ogg':    return media.canPlayType('audio/ogg; codecs="vorbis"').replace(/no/, '');
                        case 'audio/wav':    return media.canPlayType('audio/wav; codecs="1"').replace(/no/, '');
                    }
                }
            }
            catch(e) {
                return false;
            }

            // If we got this far, we're stuffed
            return false;
        }
    };

    // Player instance
    function Plyr(media, config) {
        var plyr = this,
        timers = {},
        api;

        // Set media
        plyr.media = media;
        var original = media.cloneNode(true);

        // Trigger events, with plyr instance passed
        function _triggerEvent(element, type, bubbles, properties) {
            _event(element, type, bubbles, _extend({}, properties, {
                plyr: api
            }));
        }

        // Debugging
        function _console(type, args) {
            if (config.debug && window.console) {
                args = Array.prototype.slice.call(args);

                if (_is.string(config.logPrefix) && config.logPrefix.length) {
                    args.unshift(config.logPrefix);
                }

                console[type].apply(console, args);
            }
        }
        var _log = function() { _console('log', arguments) },
            _warn = function() { _console('warn', arguments) };

        // Log config options
        _log('Config', config);

        // Get icon URL
        function _getIconUrl() {
            return {
                url:        config.iconUrl,
                absolute:   (config.iconUrl.indexOf("http") === 0) || plyr.browser.isIE
            };
        }

        function _getFontStyle(fontStyleIndex, textColor) {
            var fontStyles = ['font-style_none', 'font-style_raised','font-style_depressed', 'font-style_uniform', 'font-style_dropshadow'];

            if(fontStyleIndex === 3) {
                //outline text in black or white depending on text color
                if(textColor.indexOf('black') > -1 || textColor.indexOf('blue') > -1) {
                    return fontStyles[3] + '_white';
                }

                return fontStyles[3] + '_black';
            }

            return fontStyles[fontStyleIndex];
        }

        function _getCaptionStyleString() {
            var colors = ['white', 'black', 'red', 'green', 'blue', 'yellow', 'magenta', 'cyan'];
            var opacities = ['opaque', 'translucent', 'semitransparent', 'transparent'];
            var fonts = ['font_mono_serif', 'font_proportional_serif', 'font_mono_sans_serif', 'font_proportional_sans_serif', 'font_casual', 'font_cursive', 'font_small_caps'];
            var fontSizes = ['font-size_50', 'font-size_100', 'font-size_150', 'font-size_200'];

            var fontColor = 'txt_' + colors[plyr.captions.fontColorIndex] + '_' + opacities[plyr.captions.fontOpacityIndex];
            var backgroundColor = 'bg_' + colors[plyr.captions.backgroundColorIndex] + '_' + opacities[plyr.captions.backgroundOpacityIndex];
            var font = fonts[plyr.captions.fontIndex];
            var fontStyle = _getFontStyle(plyr.captions.fontStyleIndex, fontColor);
            var fontSize = fontSizes[plyr.captions.fontSizeIndex];

            return [font, fontColor, fontStyle, fontSize, backgroundColor].join('.');
        }

        function _initFontMenu() {
            _createCaptionStyleMenu(config.selectors.settings.font, plyr.captions.fonts, function() {
                var buttonPressed = this;
                var index = parseInt(buttonPressed.dataset.index);
                plyr.captions.font = buttonPressed.innerText;

                //update selected font in settings menu
                if(_is.htmlElement(plyr.settings.font)) {
                    plyr.settings.font.innerText = plyr.captions.font;
                }

                plyr.captions.fontIndex = index;

                _updateCaptionCues();
            });
        }

        function _initFontColorMenu() {
            _createCaptionStyleMenu(config.selectors.settings.fontColor, plyr.captions.colors, function() {
                var buttonPressed = this;
                var index = parseInt(buttonPressed.dataset.index);
                plyr.captions.fontColor = buttonPressed.innerText;

                //update selected font color in settings menu
                if(_is.htmlElement(plyr.settings.fontColor)) {
                    plyr.settings.fontColor.innerText = plyr.captions.fontColor;
                }

                plyr.captions.fontColorIndex = index;

                _updateCaptionCues();
            });
        }

        function _initFontSizeMenu() {
            _createCaptionStyleMenu(config.selectors.settings.fontSize, plyr.captions.fontSizes, function() {
                var buttonPressed = this;
                var index = parseInt(buttonPressed.dataset.index);
                plyr.captions.fontSize = buttonPressed.innerText;

                //update selected font size in settings menu
                if(_is.htmlElement(plyr.settings.fontSize)) {
                    plyr.settings.fontSize.innerText = plyr.captions.fontSize;
                }

                plyr.captions.fontSizeIndex = index;

                _updateCaptionCues();
            });
        }

        function _initFontOpacityMenu() {
            _createCaptionStyleMenu(config.selectors.settings.fontOpacity, plyr.captions.opacities, function() {
                var buttonPressed = this;
                var index = parseInt(buttonPressed.dataset.index);
                plyr.captions.fontOpacity = buttonPressed.innerText;

                //update selected font opacity in settings menu
                if(_is.htmlElement(plyr.settings.fontOpacity)) {
                    plyr.settings.fontOpacity.innerText = plyr.captions.fontOpacity;
                }

                plyr.captions.fontOpacityIndex = index;

                _updateCaptionCues();
            });
        }

        function _initFontStyleMenu() {
            _createCaptionStyleMenu(config.selectors.settings.fontStyle, plyr.captions.fontStyles, function() {
                var buttonPressed = this;
                var index = parseInt(buttonPressed.dataset.index);
                plyr.captions.fontStyle = buttonPressed.innerText;

                //update selected font style in settings menu
                if(_is.htmlElement(plyr.settings.fontStyle)) {
                    plyr.settings.fontStyle.innerText = plyr.captions.fontStyle;
                }

                plyr.captions.fontStyleIndex = index;

                _updateCaptionCues();
            });
        }

        function _initBackgroundColorMenu() {
            _createCaptionStyleMenu(config.selectors.settings.backgroundColor, plyr.captions.colors, function() {
                var buttonPressed = this;
                var index = parseInt(buttonPressed.dataset.index);
                plyr.captions.backgroundColor = buttonPressed.innerText;

                //update selected background color in settings menu
                if(_is.htmlElement(plyr.settings.backgroundColor)) {
                    plyr.settings.backgroundColor.innerText = plyr.captions.backgroundColor;
                }

                plyr.captions.backgroundColorIndex = index;

                _updateCaptionCues();
            });
        }

        function _initBackgroundOpacityMenu() {
            _createCaptionStyleMenu(config.selectors.settings.backgroundOpacity, plyr.captions.opacities, function() {
                var buttonPressed = this;
                var index = parseInt(buttonPressed.dataset.index);
                plyr.captions.backgroundOpacity = buttonPressed.innerText;

                //update selected background opacity in settings menu
                if(_is.htmlElement(plyr.settings.backgroundOpacity)) {
                    plyr.settings.backgroundOpacity.innerText = plyr.captions.backgroundOpacity;
                }

                plyr.captions.backgroundOpacityIndex = index;

                _updateCaptionCues();
            });
        }

        function _createCaptionStyleMenu(menuSelector, items, onClickCallback) {
            var menu = _getElement(menuSelector);
            if(_is.htmlElement(menu)) {

                var fragment = document.createDocumentFragment();
                for(var i = 0; i < items.length; i++) {
                    fragment.appendChild(_createCaptionStyleButton(items[i], i, onClickCallback));
                }

                menu.appendChild(fragment);
            }
        }

        function _createCaptionStyleButton(innerText, index, onClickCallback) {
            var listItem = document.createElement('li');
            var button = document.createElement('button');

            button.setAttribute('type', 'button');
            button.setAttribute('aria-controls', 'plyr-settings-' + plyr.id + '-captionStyle');
            button.innerText = innerText;
            button.dataset.index = index;

            if(onClickCallback) {
                button.onclick = onClickCallback;
            }

            listItem.appendChild(button);

            return listItem;
        }

        function _onSelectAudioTrack() {
            var buttonPressed = this;

            var trackId = parseInt(buttonPressed.dataset.id, 10);
            plyr.adaptivePlayer.audioTrackId = trackId;

            _updateSelectedAudioTrack(buttonPressed.dataset.name);
        }

        function _updateSelectedAudioTrack(audioTrackName) {

            //update selected audio track name in settings menu
            if(_is.htmlElement(plyr.settings.audio)) {
                plyr.settings.audio.innerText = audioTrackName;
            }
        }

        function _onSelectCaptionTrack() {
            var buttonPressed = this;
            var index = parseInt(buttonPressed.dataset.index);

            _setCaptionIndex(index);
        }

        function _updateSelectedCaptionTrack(captionTrackName) {

            //update selected caption track in settings menu
            if(_is.htmlElement(plyr.settings.caption)) {
                plyr.settings.caption.innerText = captionTrackName;
            }
        }

        function _initCaptionMenu() {
            if (_inArray(config.controls, 'settings')) {
                var captionsList = _getElement(config.selectors.settings.captions);

                //remove all but first child (the back button) as this can be called multiple times
                while (captionsList.lastChild && captionsList.children.length > 1) {
                    captionsList.removeChild(captionsList.lastChild);
                }

                var fragment = document.createDocumentFragment();

                var listItem = document.createElement('li');
                var button = document.createElement('button');

                button.setAttribute('type', 'button');
                button.innerText = config.i18n.none;
                button.dataset.index = -1;
                button.onclick = _onSelectCaptionTrack;

                listItem.appendChild(button);
                fragment.appendChild(listItem);

                for (var i = 0; i < plyr.media.textTracks.length; i++) {
                    if(plyr.media.textTracks[i].kind === 'subtitles' || plyr.media.textTracks[i].kind === 'captions') {
                        listItem = document.createElement('li');
                        button = document.createElement('button');

                        button.setAttribute('type', 'button');
                        button.setAttribute('aria-controls', 'plyr-settings-' + plyr.id + '-primary');

                        var label = plyr.media.textTracks[i].label;
                        if(label === '') {
                            label = 'Subtitles';
                        }

                        button.innerText = label;
                        button.dataset.index = i;
                        button.onclick = _onSelectCaptionTrack;

                        listItem.appendChild(button);
                        fragment.appendChild(listItem);
                    }
                }

                captionsList.appendChild(fragment);
            }
        }

        function _initAudioTrackMenu() {
            if (_inArray(config.controls, 'settings')) {
                var audioList = _getElement(config.selectors.settings.audio);

                //remove all but first child (the back button) as this can be called multiple times
                while (audioList.lastChild && audioList.children.length > 1) {
                    audioList.removeChild(audioList.lastChild);
                }

                var fragment = document.createDocumentFragment();
                var audioTracks = plyr.adaptivePlayer.audioTracks;

                for (var i = 0; i < audioTracks.length; i++) {
                    var track = audioTracks[i];
                    var label = _getAudioTrackLabel(track);

                    var listItem = document.createElement('li');
                    var button = document.createElement('button');

                    button.setAttribute('type', 'button');
                    button.setAttribute('aria-controls', 'plyr-settings-' + plyr.id + '-primary');
                    button.innerText = label;
                    button.dataset.id = track.id;
                    button.dataset.name = label
                    button.onclick = _onSelectAudioTrack;

                    listItem.appendChild(button);
                    fragment.appendChild(listItem);

                    if(track.enabled) {
                        _updateSelectedAudioTrack(label);
                    }
                }

                audioList.appendChild(fragment);
            }
        }

        function _browserSupportsCaptionStyles() {
            //cue styling not supported in Firefox v.50.0.2 yet
            if (plyr.browser.isFirefox) {
                return false;
            }

            //setting cue.text in Edge throws an error
            if (plyr.browser.isEdge) {
                return false;
            }

            //caption styles don't have any effect on captions
            if (plyr.browser.isIE) {
                return false;
            }

            return true;
        }

        function _updateSettingsMenu() {
            if (_inArray(config.controls, 'settings') && _is.htmlElement(plyr.buttons.settings)) {
                if(_browserSupportsCaptionStyles()) {
                    _initFontMenu();
                    _initFontColorMenu();
                    _initFontSizeMenu();
                    _initFontOpacityMenu();
                    _initFontStyleMenu();
                    _initBackgroundColorMenu();
                    _initBackgroundOpacityMenu();
                } else {
                    //hide caption style settings menu
                    plyr.settings.captionTab.setAttribute('style', 'display: none;');
                }
            }
        }

        function _updateControls() {
            var isLive = plyr.adaptivePlayer.playlistType === "LIVE";

            _updateSettingsMenu();

            if(config.showThumbnails && !plyr.adaptivePlayer.supportsThumbnails) {
                //replace thumbnail img and div container with span
                plyr.progress.container.removeChild(plyr.progress.seek.container);

                var span = document.createElement('span');
                span.setAttribute('class', 'plyr__tooltip plyr__tooltip--container plyr__tooltip--time');
                span.innerText = '00:00';

                plyr.progress.container.appendChild(span);

                plyr.progress.seek = {
                    container: _getElement(config.selectors.progress.seek.container),
                    tooltip:   _getElement(config.selectors.progress.seek.tooltip),
                    thumbnail: _getElement(config.selectors.progress.seek.thumbnail)
                };
            }

            if(!isLive) {
                return;
            }

            //hide progress bar
            _toggleClass(plyr.progress.container, config.classes.hideProgress, true);

            //change current time to say 'LIVE'
            if(plyr.currentTime) {
                _toggleClass(plyr.currentTime, 'plyr__time--current', false);
                _toggleClass(plyr.currentTime, 'plyr__time', true);
                plyr.currentTime.innerHTML = 'LIVE';

                //delete reference to element so it can't be updated
                plyr.currentTime = undefined;
            }

            //remove duration time
            if(plyr.duration) {
                plyr.duration.setAttribute('style', 'display: none;');
            }

            // uplynk -- don't show pause button on live streams
            if (plyr.buttons && plyr.buttons.pause) {
                plyr.buttons.pause.setAttribute('style', 'display: none;');
            }

            // remove click to play/pause
            config.clickToPlay = false;
            var wrapper = _getElement('.' + config.classes.videoWrapper);

            // Bail if there's no wrapper (this should never happen)
            if (!wrapper) {
                return;
            }

            wrapper.style.cursor = "default";
            _off(wrapper, 'click', _onVideoWrapperClick);
        }

        function _initCaptionStyleDefaults() {
            plyr.captions = {};

            plyr.captions.fonts = [
                config.i18n.monoSerif,
                config.i18n.proportionalSerif,
                config.i18n.monoSansSerif,
                config.i18n.proportionalSansSerif,
                config.i18n.casual,
                config.i18n.cursive,
                config.i18n.smallCaps
            ];

            plyr.captions.colors = [
                config.i18n.white,
                config.i18n.black,
                config.i18n.red,
                config.i18n.green,
                config.i18n.blue,
                config.i18n.yellow,
                config.i18n.magenta,
                config.i18n.cyan
            ];

            plyr.captions.opacities = [
                config.i18n.opaque,
                config.i18n.translucent,
                config.i18n.semitransparent,
                config.i18n.transparent
            ];

            plyr.captions.fontSizes = ['50%', '100%', '150%', '200%'];

            plyr.captions.fontStyles = [
                config.i18n.none,
                config.i18n.raised,
                config.i18n.depressed,
                config.i18n.uniform,
                config.i18n.dropShadow
            ];

            plyr.captions.fontIndex = 3;
            plyr.captions.fontColorIndex = 0;
            plyr.captions.fontSizeIndex = 1;
            plyr.captions.fontOpacityIndex = 0;
            plyr.captions.fontStyleIndex = 4;
            plyr.captions.backgroundColorIndex = 1;
            plyr.captions.backgroundOpacityIndex = 3;

            plyr.captions.font = plyr.captions.fonts[plyr.captions.fontIndex];
            plyr.captions.fontColor = plyr.captions.colors[plyr.captions.fontColorIndex];
            plyr.captions.fontSize = plyr.captions.fontSizes[plyr.captions.fontSizeIndex];
            plyr.captions.fontOpacity = plyr.captions.opacities[plyr.captions.fontOpacityIndex];
            plyr.captions.fontStyle = plyr.captions.fontStyles[plyr.captions.fontStyleIndex];
            plyr.captions.backgroundColor = plyr.captions.colors[plyr.captions.backgroundColorIndex];
            plyr.captions.backgroundOpacity = plyr.captions.opacities[plyr.captions.backgroundOpacityIndex];
        }

        // Build the default HTML
        function _buildControls() {
            // Create html array
            var html        = [],
                iconUrl     = _getIconUrl(),
                iconPath    = (!iconUrl.absolute ? iconUrl.url : '') + '#' + config.iconPrefix;

            html.push('<div class="plyr__ad-overlay">');

            html.push(
                '<span class="plyr__time">',
                    '<span class="plyr__sr-only">' + config.i18n.adDuration + '</span>',
                    '<span class="plyr__time--ad-duration">00:00</span>',
                '</span>'
            );

            html.push('</div>');

            // Larger overlaid play button
            if (_inArray(config.controls, 'play-large')) {
                html.push(
                    '<button type="button" data-plyr="play" class="plyr__play-large">',
                        '<svg><use xlink:href="' + iconPath + '-play" /></svg>',
                        '<span class="plyr__sr-only">' + config.i18n.play + '</span>',
                    '</button>'
                );
            }

            html.push('<div class="plyr__controls">');

            // Restart button
            if (_inArray(config.controls, 'restart')) {
                html.push(
                    '<button type="button" data-plyr="restart">',
                        '<svg><use xlink:href="' + iconPath + '-restart" /></svg>',
                        '<span class="plyr__sr-only">' + config.i18n.restart + '</span>',
                    '</button>'
                );
            }

            // Rewind button
            if (_inArray(config.controls, 'rewind')) {
                html.push(
                    '<button type="button" data-plyr="rewind">',
                        '<svg><use xlink:href="' + iconPath + '-rewind" /></svg>',
                        '<span class="plyr__sr-only">' + config.i18n.rewind + '</span>',
                    '</button>'
                );
            }

            // Play Pause button
            // TODO: This should be a toggle button really?
            if (_inArray(config.controls, 'play')) {
                html.push(
                    '<button type="button" data-plyr="play">',
                        '<svg><use xlink:href="' + iconPath + '-play" /></svg>',
                        '<span class="plyr__sr-only">' + config.i18n.play + '</span>',
                    '</button>',
                    '<button type="button" data-plyr="pause">',
                        '<svg><use xlink:href="' + iconPath + '-pause" /></svg>',
                        '<span class="plyr__sr-only">' + config.i18n.pause + '</span>',
                    '</button>'
                );
            }

            // Fast forward button
            if (_inArray(config.controls, 'fast-forward')) {
                html.push(
                    '<button type="button" data-plyr="fast-forward">',
                        '<svg><use xlink:href="' + iconPath + '-fast-forward" /></svg>',
                        '<span class="plyr__sr-only">' + config.i18n.forward + '</span>',
                    '</button>'
                );
            }

            // Media current time display
            if (_inArray(config.controls, 'current-time')) {
                html.push(
                    '<span class="plyr__time">',
                        '<span class="plyr__sr-only">' + config.i18n.currentTime + '</span>',
                        '<span class="plyr__time--current">00:00</span>',
                    '</span>'
                );
            }

            // Progress
            if (_inArray(config.controls, 'progress')) {
                // Create progress
                html.push('<span class="plyr__progress">',
                    '<label for="seek{id}" class="plyr__sr-only">Seek</label>',
                    '<input id="seek{id}" class="plyr__progress--seek" type="range" min="0" max="100" step="0.1" value="0" data-plyr="seek">',
                    '<progress class="plyr__progress--played" max="100" value="0" role="presentation"></progress>',
                    '<progress class="plyr__progress--buffer" max="100" value="0">',
                        '<span>0</span>% ' + config.i18n.buffered,
                    '</progress>');

                // Seek tooltip
                if (config.tooltips.seek) {
                    if(config.showThumbnails) {
                        html.push('<div class="plyr__tooltip plyr__tooltip--container">',
                            '<img class="plyr__tooltip--thumbnail" />',
                            '<div class="plyr__tooltip--time">00:00</div>',
                            '</div>');
                    } else {
                        html.push('<span class="plyr__tooltip plyr__tooltip--container plyr__tooltip--time">00:00</span>');
                    }
                }

                // Close
                html.push('</span>');
            } else {
                // Create empty progress to preserve spacing
                html.push('<span class="plyr__progress"></span>');
            }

            // Media duration display
            if (_inArray(config.controls, 'duration')) {
                html.push(
                    '<span class="plyr__time">',
                        '<span class="plyr__sr-only">' + config.i18n.duration + '</span>',
                        '<span class="plyr__time--duration">00:00</span>',
                    '</span>'
                );
            }

            // Toggle mute button
            if (_inArray(config.controls, 'mute')) {
                html.push(
                    '<button type="button" data-plyr="mute">',
                        '<svg class="icon--muted"><use xlink:href="' + iconPath + '-muted" /></svg>',
                        '<svg><use xlink:href="' + iconPath + '-volume" /></svg>',
                        '<span class="plyr__sr-only">' + config.i18n.toggleMute + '</span>',
                    '</button>'
                );
            }

            // Volume range control
            if (_inArray(config.controls, 'volume')) {
                html.push(
                    '<span class="plyr__volume">',
                        '<label for="volume-{id}" class="plyr__sr-only">' + config.i18n.volume + '</label>',
                        '<input id="volume-{id}" class="plyr__volume--input" type="range" min="' + config.volumeMin + '" max="' + config.volumeMax + '" value="' + config.volume + '" data-plyr="volume">',
                        '<progress class="plyr__volume--display" max="' + config.volumeMax + '" value="' + config.volumeMin + '" role="presentation"></progress>',
                    '</span>'
                );
            }

            // Toggle captions button
            if (_inArray(config.controls, 'captions')) {
                html.push(
                    '<button type="button" data-plyr="captions">',
                        '<svg class="icon--captions-on"><use xlink:href="' + iconPath + '-captions-on" /></svg>',
                        '<svg><use xlink:href="' + iconPath+ '-captions-off" /></svg>',
                        '<span class="plyr__sr-only">' + config.i18n.toggleCaptions + '</span>',
                    '</button>'
                );
            }

            // Settings button / menu
            if (_inArray(config.controls, 'settings')) {
                html.push(
                    '<div class="plyr__menu" data-plyr="settings">',
                        '<button type="button" id="plyr-settings-toggle-{id}" aria-haspopup="true" aria-controls="plyr-settings-{id}" aria-expanded="false">',
                            '<svg><use xlink:href="' + iconPath + '-settings" /></svg>',
                            '<span class="plyr__sr-only">' + config.i18n.settings + '</span>',
                        '</button>',
                        '<div class="plyr__menu__container" id="plyr-settings-{id}" aria-hidden="true" aria-labelled-by="plyr-settings-toggle-{id}" role="tablist" tabindex="-1">',
                            '<div>',
                                '<div class="plyr__menu__primary" id="plyr-settings-{id}-primary" aria-hidden="false" aria-labelled-by="plyr-settings-toggle-{id}" role="tabpanel" tabindex="-1">',
                                    '<ul>',
                                        '<li role="tab">',
                                            '<button type="button" class="plyr__menu__btn plyr__menu__btn--forward" id="plyr-settings-{id}-audio-toggle" aria-haspopup="true" aria-controls="plyr-settings-{id}-audio" aria-expanded="false">',
                                                config.i18n.audio + ' <span class="plyr__menu__btn__value">' + config.i18n.none + '</span>',
                                            '</button>',
                                        '</li>',
                                        '<li role="tab">',
                                            '<button type="button" class="plyr__menu__btn plyr__menu__btn--forward" id="plyr-settings-{id}-captions-toggle" aria-haspopup="true" aria-controls="plyr-settings-{id}-captions" aria-expanded="false">',
                                                config.i18n.captions + ' <span class="plyr__menu__btn__value">' + config.i18n.none + '</span>',
                                            '</button>',
                                        '</li>',
                                        '<li role="tab" id="plyr-settings-{id}-captionStyle-tab">',
                                            '<button type="button" class="plyr__menu__btn plyr__menu__btn--forward" id="plyr-settings-{id}-captionStyle-toggle" aria-haspopup="true" aria-controls="plyr-settings-{id}-captionStyle" aria-expanded="false">',
                                                config.i18n.captionStyle,
                                            '</button>',
                                        '</li>',
                                    '</ul>',
                                '</div>',
                                '<div class="plyr__menu__secondary" id="plyr-settings-{id}-captions" aria-hidden="true" aria-labelled-by="plyr-settings-{id}-captions-toggle" role="tabpanel" tabindex="-1">',
                                    '<ul data-plyr="settings-captions">',
                                        '<li role="tab">',
                                            '<button type="button" class="plyr__menu__btn plyr__menu__btn--back" aria-haspopup="true" aria-controls="plyr-settings-{id}-primary" aria-expanded="false">',
                                                config.i18n.captions,
                                            '</button>',
                                        '</li>',
                                    '</ul>',
                                '</div>',
                                '<div class="plyr__menu__secondary" id="plyr-settings-{id}-audio" aria-hidden="true" aria-labelled-by="plyr-settings-{id}-audio-toggle" role="tabpanel" tabindex="-1">',
                                    '<ul data-plyr="settings-audio">',
                                        '<li role="tab">',
                                            '<button type="button" class="plyr__menu__btn plyr__menu__btn--back" aria-haspopup="true" aria-controls="plyr-settings-{id}-primary" aria-expanded="false">',
                                                config.i18n.audio,
                                            '</button>',
                                        '</li>',
                                    '</ul>',
                                '</div>',

                                //caption styles
                                '<div class="plyr__menu__secondary" id="plyr-settings-{id}-captionStyle" aria-hidden="true" aria-labelled-by="plyr-settings-{id}-captionStyle-toggle" role="tabpanel" tabindex="-1">',
                                    '<ul data-plyr="settings-captionStyle">',
                                        '<li role="tab">',
                                            '<button type="button" class="plyr__menu__btn plyr__menu__btn--back" aria-haspopup="true" aria-controls="plyr-settings-{id}-primary" aria-expanded="false">',
                                                config.i18n.captionStyle,
                                            '</button>',
                                        '</li>',
                                        '<li role="tab">',
                                            '<button type="button" class="plyr__menu__btn plyr__menu__btn--forward" id="plyr-settings-{id}-font-toggle" aria-haspopup="true" aria-controls="plyr-settings-{id}-font" aria-expanded="false">',
                                                config.i18n.font + ' <span class="plyr__menu__btn__value">' + plyr.captions.font + '</span>',
                                            '</button>',
                                        '</li>',
                                        '<li role="tab">',
                                            '<button type="button" class="plyr__menu__btn plyr__menu__btn--forward" id="plyr-settings-{id}-fontColor-toggle" aria-haspopup="true" aria-controls="plyr-settings-{id}-fontColor" aria-expanded="false">',
                                                config.i18n.fontColor + ' <span class="plyr__menu__btn__value">' + plyr.captions.fontColor + '</span>',
                                            '</button>',
                                        '</li>',
                                        '<li role="tab">',
                                            '<button type="button" class="plyr__menu__btn plyr__menu__btn--forward" id="plyr-settings-{id}-fontSize-toggle" aria-haspopup="true" aria-controls="plyr-settings-{id}-fontSize" aria-expanded="false">',
                                                config.i18n.fontSize + ' <span class="plyr__menu__btn__value">' + plyr.captions.fontSize + '</span>',
                                            '</button>',
                                        '</li>',
                                        '<li role="tab">',
                                            '<button type="button" class="plyr__menu__btn plyr__menu__btn--forward" id="plyr-settings-{id}-fontOpacity-toggle" aria-haspopup="true" aria-controls="plyr-settings-{id}-fontOpacity" aria-expanded="false">',
                                                config.i18n.fontOpacity + ' <span class="plyr__menu__btn__value">' + plyr.captions.fontOpacity + '</span>',
                                            '</button>',
                                        '</li>',
                                        '<li role="tab">',
                                            '<button type="button" class="plyr__menu__btn plyr__menu__btn--forward" id="plyr-settings-{id}-fontStyle-toggle" aria-haspopup="true" aria-controls="plyr-settings-{id}-fontStyle" aria-expanded="false">',
                                                config.i18n.fontStyle + ' <span class="plyr__menu__btn__value">' + plyr.captions.fontStyle + '</span>',
                                            '</button>',
                                        '</li>',
                                        '<li role="tab">',
                                            '<button type="button" class="plyr__menu__btn plyr__menu__btn--forward" id="plyr-settings-{id}-backgroundColor-toggle" aria-haspopup="true" aria-controls="plyr-settings-{id}-backgroundColor" aria-expanded="false">',
                                                config.i18n.backgroundColor + ' <span class="plyr__menu__btn__value">' + plyr.captions.backgroundColor + '</span>',
                                            '</button>',
                                        '</li>',
                                        '<li role="tab">',
                                            '<button type="button" class="plyr__menu__btn plyr__menu__btn--forward" id="plyr-settings-{id}-backgroundOpacity-toggle" aria-haspopup="true" aria-controls="plyr-settings-{id}-backgroundOpacity" aria-expanded="false">',
                                                config.i18n.backgroundOpacity + ' <span class="plyr__menu__btn__value">' + plyr.captions.backgroundOpacity + '</span>',
                                            '</button>',
                                        '</li>',
                                    '</ul>',
                                '</div>',

                                //font selection
                                '<div class="plyr__menu__secondary" id="plyr-settings-{id}-font" aria-hidden="true" aria-labelled-by="plyr-settings-{id}-captionStyle-toggle" role="tabpanel" tabindex="-1">',
                                    '<ul data-plyr="settings-font">',
                                        '<li role="tab">',
                                            '<button type="button" class="plyr__menu__btn plyr__menu__btn--back" aria-haspopup="true" aria-controls="plyr-settings-{id}-captionStyle" aria-expanded="false">',
                                                config.i18n.font,
                                            '</button>',
                                        '</li>',
                                    '</ul>',
                                '</div>',

                                //font color
                                '<div class="plyr__menu__secondary" id="plyr-settings-{id}-fontColor" aria-hidden="true" aria-labelled-by="plyr-settings-{id}-captionStyle-toggle" role="tabpanel" tabindex="-1">',
                                    '<ul data-plyr="settings-fontColor">',
                                        '<li role="tab">',
                                            '<button type="button" class="plyr__menu__btn plyr__menu__btn--back" aria-haspopup="true" aria-controls="plyr-settings-{id}-captionStyle" aria-expanded="false">',
                                                config.i18n.fontColor,
                                            '</button>',
                                        '</li>',
                                    '</ul>',
                                '</div>',

                                //font size
                                '<div class="plyr__menu__secondary" id="plyr-settings-{id}-fontSize" aria-hidden="true" aria-labelled-by="plyr-settings-{id}-captionStyle-toggle" role="tabpanel" tabindex="-1">',
                                    '<ul data-plyr="settings-fontSize">',
                                        '<li role="tab">',
                                            '<button type="button" class="plyr__menu__btn plyr__menu__btn--back" aria-haspopup="true" aria-controls="plyr-settings-{id}-captionStyle" aria-expanded="false">',
                                                config.i18n.fontSize,
                                            '</button>',
                                        '</li>',
                                    '</ul>',
                                '</div>',

                                //font opacity
                                '<div class="plyr__menu__secondary" id="plyr-settings-{id}-fontOpacity" aria-hidden="true" aria-labelled-by="plyr-settings-{id}-captionStyle-toggle" role="tabpanel" tabindex="-1">',
                                    '<ul data-plyr="settings-fontOpacity">',
                                        '<li role="tab">',
                                            '<button type="button" class="plyr__menu__btn plyr__menu__btn--back" aria-haspopup="true" aria-controls="plyr-settings-{id}-captionStyle" aria-expanded="false">',
                                                config.i18n.fontOpacity,
                                            '</button>',
                                        '</li>',
                                    '</ul>',
                                '</div>',

                                //font style
                                '<div class="plyr__menu__secondary" id="plyr-settings-{id}-fontStyle" aria-hidden="true" aria-labelled-by="plyr-settings-{id}-captionStyle-toggle" role="tabpanel" tabindex="-1">',
                                    '<ul data-plyr="settings-fontStyle">',
                                        '<li role="tab">',
                                            '<button type="button" class="plyr__menu__btn plyr__menu__btn--back" aria-haspopup="true" aria-controls="plyr-settings-{id}-captionStyle" aria-expanded="false">',
                                                config.i18n.fontStyle,
                                            '</button>',
                                        '</li>',
                                    '</ul>',
                                '</div>',

                                //background color
                                '<div class="plyr__menu__secondary" id="plyr-settings-{id}-backgroundColor" aria-hidden="true" aria-labelled-by="plyr-settings-{id}-captionStyle-toggle" role="tabpanel" tabindex="-1">',
                                    '<ul data-plyr="settings-backgroundColor">',
                                        '<li role="tab">',
                                            '<button type="button" class="plyr__menu__btn plyr__menu__btn--back" aria-haspopup="true" aria-controls="plyr-settings-{id}-captionStyle" aria-expanded="false">',
                                                config.i18n.backgroundColor,
                                            '</button>',
                                        '</li>',
                                    '</ul>',
                                '</div>',

                                //background opacity
                                '<div class="plyr__menu__secondary" id="plyr-settings-{id}-backgroundOpacity" aria-hidden="true" aria-labelled-by="plyr-settings-{id}-captionStyle-toggle" role="tabpanel" tabindex="-1">',
                                    '<ul data-plyr="settings-backgroundOpacity">',
                                        '<li role="tab">',
                                            '<button type="button" class="plyr__menu__btn plyr__menu__btn--back" aria-haspopup="true" aria-controls="plyr-settings-{id}-captionStyle" aria-expanded="false">',
                                                config.i18n.backgroundOpacity,
                                            '</button>',
                                        '</li>',
                                    '</ul>',
                                '</div>',

                                //window color
                                '<div class="plyr__menu__secondary" id="plyr-settings-{id}-windowColor" aria-hidden="true" aria-labelled-by="plyr-settings-{id}-captionStyle-toggle" role="tabpanel" tabindex="-1">',
                                    '<ul data-plyr="settings-windowColor">',
                                        '<li role="tab">',
                                            '<button type="button" class="plyr__menu__btn plyr__menu__btn--back" aria-haspopup="true" aria-controls="plyr-settings-{id}-captionStyle" aria-expanded="false">',
                                                config.i18n.windowColor,
                                            '</button>',
                                        '</li>',
                                    '</ul>',
                                '</div>',

                                //window opacity
                                '<div class="plyr__menu__secondary" id="plyr-settings-{id}-windowOpacity" aria-hidden="true" aria-labelled-by="plyr-settings-{id}-captionStyle-toggle" role="tabpanel" tabindex="-1">',
                                    '<ul data-plyr="settings-windowOpacity">',
                                        '<li role="tab">',
                                            '<button type="button" class="plyr__menu__btn plyr__menu__btn--back" aria-haspopup="true" aria-controls="plyr-settings-{id}-captionStyle" aria-expanded="false">',
                                                config.i18n.windowOpacity,
                                            '</button>',
                                        '</li>',
                                    '</ul>',
                                '</div>',
                            '</div>',
                        '</div>',
                    '</div>'
                );
            }

            // Picture in picture button
            if (_inArray(config.controls, 'pip') && _support.pip) {
                html.push(
                    '<button type="button" data-plyr="pip">',
                        '<svg><use xlink:href="' + iconPath + '-pip" /></svg>',
                        '<span class="plyr__sr-only">PIP</span>',
                    '</button>'
                );
            }

            // Airplay button
            if (_inArray(config.controls, 'airplay') && _support.airplay) {
                html.push(
                    '<button type="button" data-plyr="airplay">',
                        '<svg><use xlink:href="' + iconPath + '-airplay" /></svg>',
                        '<span class="plyr__sr-only">AirPlay</span>',
                    '</button>'
                );
            }

            // Toggle fullscreen button
            if (_inArray(config.controls, 'fullscreen') && !plyr.browser.isIos && !plyr.browser.isOldSafari ) {
                html.push(
                    '<button type="button" data-plyr="fullscreen">',
                        '<svg class="icon--exit-fullscreen"><use xlink:href="' + iconPath + '-exit-fullscreen" /></svg>',
                        '<svg><use xlink:href="' + iconPath + '-enter-fullscreen" /></svg>',
                        '<span class="plyr__sr-only">' + config.i18n.toggleFullscreen + '</span>',
                    '</button>'
                );
            }

            // Close everything
            html.push('</div>');

            return html.join('');
        }

        // Setup fullscreen
        function _setupFullscreen() {
            if (!plyr.supported.full) {
                return;
            }

            if ((plyr.type !== 'audio' || config.fullscreen.allowAudio) && config.fullscreen.enabled) {
                // Check for native support
                var nativeSupport = _support.fullscreen;

                if (nativeSupport || (config.fullscreen.fallback && !_inFrame())) {
                    _log((nativeSupport ? 'Native' : 'Fallback') + ' fullscreen enabled');

                    // Add styling hook
                    _toggleClass(plyr.container, config.classes.fullscreen.enabled, true);
                } else {
                    _log('Fullscreen not supported and fallback disabled');
                }

                // Toggle state
                if (plyr.buttons && plyr.buttons.fullscreen) {
                    _toggleState(plyr.buttons.fullscreen, false);
                }

                // Setup focus trap
                _focusTrap();
            }
        }

        function _getAudioTrackLabel(audioTrack) {
            var languageMap = {
                'en':  config.i18n.english,
                'de':  config.i18n.german,
                'es':  config.i18n.spanish,
                'fr':  config.i18n.french,
                'it':  config.i18n.italian,
                'dut': config.i18n.dutch,
                'pl':  config.i18n.polish,
                'pt':  config.i18n.portuguese,
                'ru':  config.i18n.russian,
                'vi':  config.i18n.vietnamese,
                'da':  config.i18n.danish,
                'zh':  config.i18n.chinese,
                'sv':  config.i18n.swedish,
                'th':  config.i18n.thai
            }

            if (audioTrack.label) {
                return audioTrack.label;
            } else if (audioTrack.language) {
                var language = audioTrack.language.toLowerCase();
                if (languageMap.hasOwnProperty(language)) {
                    return languageMap[language];
                } else {
                    return audioTrack.language;
                }
            }

            return audioTrack.id;
        }

        function _setupAudioTracks() {
            // Bail if not HTML5 video
            if (plyr.type !== 'video') {
                return;
            }

            _initAudioTrackMenu();
        }

        // Setup captions
        function _setupCaptions() {
            // Bail if not HTML5 video
            if (plyr.type !== 'video') {
                return;
            }

            var addCue = TextTrack.prototype.addCue;

            plyr.media.textTracks.addEventListener('addtrack', function (addTrackEvent) {
				var track = addTrackEvent.track;
                var isCaptionTrack = (track.kind === 'subtitles' || track.kind === 'captions');

                if (isCaptionTrack) {
                    //update caption cue menu as new text tracks are added (either by uplynk player or native)
                    _initCaptionMenu();
                }

                //override TextTrack.addCue() so we can style the cues
                // as they are added and before they are displayed.
                track.addCue = function(cue) {

                    if (isCaptionTrack && track.cues && track.cues.length > 0 &&
                        cue.startTime.toFixed(3) === track.cues[track.cues.length - 1].startTime.toFixed(3) &&
                        cue.startTime + 0.100 < cue.endTime) {
                            //When two cues are presented at the same time, Chrome and Safari sometimes don't
                            // render both cues with the appropriate styles.  One cue may have the custom font
                            // color set, while the other may be the default color.  Adjusting the start time of one
                            // of the cues so they don't get rendered at the same time fixes this issue.
                            cue.startTime += 0.100;
                        }

                    if (isCaptionTrack && _browserSupportsCaptionStyles()) {
                        _updateCaptionCue(cue);
                    }

                    if (plyr.browser.isIE || plyr.browser.isEdge) {
                        //IE and Edge throw an error if we add cues that have a start time that is
                        // earlier than existing cues in the track. This removes any cues that come after
                        // the cue we are trying to add, then re-adds them after adding the new cue. (UP-3518)
                        if (track.cues && track.cues.length > 0) {
                            var tempCues = [];

                            //save cues that come after our new cue
                            for (var i = 0; i < track.cues.length; i++) {
                                if (cue.startTime < track.cues[i].startTime) {
                                    tempCues.push(track.cues[i]);
                                }
                            }

                            //remove cues from track that come after our new cue
                            for (var i = 0; i < tempCues.length; i++) {
                                track.removeCue(tempCues[i]);
                            }

                            //add new cue
                            addCue.apply(this, arguments);

                            //add back in cues that come after new cue
                            for (var i = 0; i < tempCues.length; i++) {
                                addCue.apply(this, [tempCues[i]]);
                            }
                        } else {
                            //no existing cues so go ahead and add this new cue
                            addCue.apply(this, arguments);
                        }
                    } else {
                        addCue.apply(this, arguments);
                    }
                }

                if (isCaptionTrack && _browserSupportsCaptionStyles()) {
                    //if using the native player, our track.addCue() "overload" isn't used by the browsers
                    // so we need to subscribe to 'cue change' so we can change cue styles for
                    // all cues when a cue is displayed.
                    if (plyr.adaptivePlayer && plyr.adaptivePlayer.className === 'NativePlayer') {
                        track.addEventListener('cuechange', _onCueChange);
                    }
                }
			});

            plyr.media.textTracks.addEventListener('change', function() {
                for (var i = 0; i < plyr.media.textTracks.length; i++) {
                    var track = plyr.media.textTracks[i];
                    if (track.kind === 'subtitles' || track.kind === 'captions') {
                        if (track.mode === 'showing') {
                            //update ui to reflect changes in selected caption track
                            _updateSelectedCaptionTrack(track.label);
                            return;
                        }
                    }
                }
            });
        }

        function _onCueChange() {
            if (!_browserSupportsCaptionStyles()) {
                return;
            }

            var track = this;

            if (track.cues && track.cues.length > 0) {
                var style = _getCaptionStyleString();

                for (var i = 0; i < track.cues.length; i++) {
                    var cue = track.cues[i];
                    _styleCaptionCue(cue, style);
                }
            }
        }

        function _updateCaptionCues() {
            if (!_browserSupportsCaptionStyles()) {
                return;
            }

            if (config.captions.selectedIndex < 0 || config.captions.selectedIndex >= plyr.media.textTracks.length) {
                return;
            }

            var track = plyr.media.textTracks[config.captions.selectedIndex];
            var style = _getCaptionStyleString();

            //update active cues
            if (track.activeCues && track.activeCues.length > 0) {
                for (var i = 0; i < track.activeCues.length; i++) {
                    var cue = track.activeCues[i];

                    //re-add cue to try to force a refresh on screen.
                    // doing so will cause _styleCaptionCue() to be called.
                    track.addCue(cue);
                }
            }

            //update all other cues
            if (track.cues && track.cues.length > 0) {
                for (var i = 0; i < track.cues.length; i++) {
                    var cue = track.cues[i];

                    _styleCaptionCue(cue, style);
                }
            }
        }

        function _updateCaptionCue(cue) {
            if (!_browserSupportsCaptionStyles()) {
                return;
            }

            var style = _getCaptionStyleString();
            _styleCaptionCue(cue, style);
        }

        function _styleCaptionCue(cue, style) {
            //has a style already been applied
            if (cue.originalText) {
                cue.text = '<c.' + style + '>' + cue.originalText + '</c>';
            } else {
                //new cue without style
                //save text in new property 'originalText' so we can easily
                // apply a new style later on if needed.
                cue.originalText = cue.text;
                cue.text = '<c.' + style + '>' + cue.text + '</c>';
            }
        }

        // Find all elements
        function _getElements(selector) {
            return plyr.container.querySelectorAll(selector);
        }

        // Find a single element
        function _getElement(selector) {
            return _getElements(selector)[0];
        }

        // Determine if we're in an iframe
        function _inFrame() {
            try {
                return window.self !== window.top;
            }
            catch (e) {
                return true;
            }
        }

        // Trap focus inside container
        function _focusTrap() {
            var tabbables   = _getElements('input:not([disabled]), button:not([disabled])'),
                first       = tabbables[0],
                last        = tabbables[tabbables.length - 1];

            function _checkFocus(event) {
                // If it is TAB
                if (event.which === 9 && plyr.isFullscreen) {
                    if (event.target === last && !event.shiftKey) {
                        // Move focus to first element that can be tabbed if Shift isn't used
                        event.preventDefault();
                        first.focus();
                    } else if (event.target === first && event.shiftKey) {
                        // Move focus to last element that can be tabbed if Shift is used
                        event.preventDefault();
                        last.focus();
                    }
                }
            }

            // Bind the handler
            _on(plyr.container, 'keydown', _checkFocus);
        }

        // Add elements to HTML5 media (source, tracks, etc)
        function _insertChildElements(type, attributes) {
            if (_is.string(attributes)) {
               _insertElement(type, plyr.media, { src: attributes });
            } else if (attributes.constructor === Array) {
                for (var i = attributes.length - 1; i >= 0; i--) {
                    _insertElement(type, plyr.media, attributes[i]);
                }
            }
        }

        // Insert controls
        function _injectControls() {
            // Sprite
            if (config.loadSprite) {
                var iconUrl = _getIconUrl();

                // Only load external sprite using AJAX
                if (iconUrl.absolute) {
                    _log('AJAX loading absolute SVG sprite' + (plyr.browser.isIE ? ' (due to IE)' : ''));
                    loadSprite(iconUrl.url, "sprite-plyr");
                } else {
                    _log('Sprite will be used as external resource directly');
                }
            }

            // Make a copy of the html
            var html = config.html;

            // Insert custom video controls
            _log('Injecting custom controls');

            // If no controls are specified, create default
            if (!html) {
                html = _buildControls();
            }

            // Replace seek time instances
            html = _replaceAll(html, '{seektime}', config.seekTime);

            // Replace seek time instances
            html = _replaceAll(html, '{speed}', config.currentSpeed.toFixed(1).toString().replace('.0', '') + '&times;');

            // Replace current captions language
            html = _replaceAll(html, '{lang}', 'English');

            // Replace all id references with random numbers
            plyr.id = Math.floor(Math.random() * (10000));
            html = _replaceAll(html, '{id}', plyr.id);

            // Controls container
            var target;

            // Inject to custom location
            if (_is.string(config.selectors.controls.container)) {
                target = document.querySelector(config.selectors.controls.container);
            }

            // Inject into the container by default
            if (!_is.htmlElement(target)) {
                target = plyr.container
            }

            // Inject controls HTML
            target.insertAdjacentHTML('beforeend', html);

            // Setup tooltips
            if (config.tooltips.controls) {
                var labels = _getElements([config.selectors.controls.wrapper, ' ', config.selectors.labels, ' .', config.classes.hidden].join(''));

                for (var i = labels.length - 1; i >= 0; i--) {
                    var label = labels[i];

                    _toggleClass(label, config.classes.hidden, false);
                    _toggleClass(label, config.classes.tooltip, true);
                }
            }
        }

        // Find the UI controls and store references
        function _findElements() {
            try {
                plyr.controls           = _getElement(config.selectors.controls.wrapper);

                // Buttons
                plyr.buttons = {
                    seek:               _getElement(config.selectors.buttons.seek),
                    play:               _getElements(config.selectors.buttons.play),
                    pause:              _getElement(config.selectors.buttons.pause),
                    restart:            _getElement(config.selectors.buttons.restart),
                    rewind:             _getElement(config.selectors.buttons.rewind),
                    forward:            _getElement(config.selectors.buttons.forward),
                    fullscreen:         _getElement(config.selectors.buttons.fullscreen),
                    settings:           _getElement(config.selectors.buttons.settings),
                    pip:                _getElement(config.selectors.buttons.pip)
                };

                // Inputs
                plyr.buttons.mute       = _getElement(config.selectors.buttons.mute);
                plyr.buttons.captions   = _getElement(config.selectors.buttons.captions);

                // Progress
                plyr.progress = {
                    container:          _getElement(config.selectors.progress.container)
                };

                // Progress - Buffering
                plyr.progress.buffer = (function() {
                    var bar = _getElement(config.selectors.progress.buffer);

                    return {
                        bar:            bar,
                        text:           _is.htmlElement(bar) && bar.getElementsByTagName('span')[0]
                    };
                })();

                // Progress - Played
                plyr.progress.played    = _getElement(config.selectors.progress.played);

                // Seek tooltip
                plyr.progress.seek = {
                    container: _getElement(config.selectors.progress.seek.container),
                    tooltip:   _getElement(config.selectors.progress.seek.tooltip),
                    thumbnail: _getElement(config.selectors.progress.seek.thumbnail)
                };

                // Volume
                plyr.volume = {
                    input:              _getElement(config.selectors.volume.input),
                    display:            _getElement(config.selectors.volume.display)
                };

                // Timing
                plyr.duration           = _getElement(config.selectors.duration);
                plyr.currentTime        = _getElement(config.selectors.currentTime);
                plyr.seekTime           = _getElements(config.selectors.seekTime);
                plyr.adDuration         = _getElement(config.selectors.adDuration);

                plyr.settings = (function() {
                    var captionTab =        _getElement('#plyr-settings-' + plyr.id + '-captionStyle-tab');
                    var caption =           _getElement('#plyr-settings-' + plyr.id + '-captions-toggle');
                    var audio =             _getElement('#plyr-settings-' + plyr.id + '-audio-toggle');
                    var font =              _getElement('#plyr-settings-' + plyr.id + '-font-toggle');
                    var fontColor =         _getElement('#plyr-settings-' + plyr.id + '-fontColor-toggle');
                    var fontSize =          _getElement('#plyr-settings-' + plyr.id + '-fontSize-toggle');
                    var fontOpacity =       _getElement('#plyr-settings-' + plyr.id + '-fontOpacity-toggle');
                    var fontStyle =         _getElement('#plyr-settings-' + plyr.id + '-fontStyle-toggle');
                    var backgroundColor =   _getElement('#plyr-settings-' + plyr.id + '-backgroundColor-toggle');
                    var backgroundOpacity = _getElement('#plyr-settings-' + plyr.id + '-backgroundOpacity-toggle');
                    var windowColor =       _getElement('#plyr-settings-' + plyr.id + '-windowColor-toggle');
                    var windowOpacity =     _getElement('#plyr-settings-' + plyr.id + '-windowOpacity-toggle');

                    return {
                        captionTab:        _is.htmlElement(captionTab) && captionTab,
                        caption:           _is.htmlElement(caption) && caption.getElementsByTagName('span')[0],
                        audio:             _is.htmlElement(audio) && audio.getElementsByTagName('span')[0],
                        font:              _is.htmlElement(font) && font.getElementsByTagName('span')[0],
                        fontColor:         _is.htmlElement(fontColor) && fontColor.getElementsByTagName('span')[0],
                        fontSize:          _is.htmlElement(fontSize) && fontSize.getElementsByTagName('span')[0],
                        fontOpacity:       _is.htmlElement(fontOpacity) && fontOpacity.getElementsByTagName('span')[0],
                        fontStyle:         _is.htmlElement(fontStyle) && fontStyle.getElementsByTagName('span')[0],
                        backgroundColor:   _is.htmlElement(backgroundColor) && backgroundColor.getElementsByTagName('span')[0],
                        backgroundOpacity: _is.htmlElement(backgroundOpacity) && backgroundOpacity.getElementsByTagName('span')[0],
                        windowColor:       _is.htmlElement(windowColor) && windowColor.getElementsByTagName('span')[0],
                        windowOpacity:     _is.htmlElement(windowOpacity) && windowOpacity.getElementsByTagName('span')[0]
                    }
                })();

                return true;
            }
            catch(e) {
                _warn('It looks like there is a problem with your controls HTML', e);

                // Restore native video controls
                _toggleNativeControls(true);

                return false;
            }
        }

        // Toggle style hook
        function _toggleStyleHook() {
            _toggleClass(plyr.container, config.selectors.container.replace('.', ''), plyr.supported.full);
        }

        // Toggle native controls
        function _toggleNativeControls(toggle) {
            if (toggle && _inArray(config.types.html5, plyr.type)) {
                plyr.media.setAttribute('controls', '');
            } else {
                plyr.media.removeAttribute('controls');
            }
        }

        // Setup aria attribute for play and iframe title
        function _setTitle(iframe) {
            // Find the current text
            var label = config.i18n.play;

            // If there's a media title set, use that for the label
            if (_is.string(config.title) && config.title.length) {
                label += ', ' + config.title;

                // Set container label
                plyr.container.setAttribute('aria-label', config.title);
            }

            // If there's a play button, set label
            if (plyr.supported.full && plyr.buttons.play) {
                for (var i = plyr.buttons.play.length - 1; i >= 0; i--) {
                    plyr.buttons.play[i].setAttribute('aria-label', label);
                }
            }

            // Set iframe title
            // https://github.com/Selz/plyr/issues/124
            if (_is.htmlElement(iframe)) {
                iframe.setAttribute('title', config.i18n.frameTitle.replace('{title}', config.title));
            }
        }

        // Setup localStorage
        function _setupStorage() {
            var value = null;
            plyr.storage = {};

            // Bail if we don't have localStorage support or it's disabled
            if (!_support.storage || !config.storage.enabled) {
                return;
            }

            // Clean up old volume
            // https://github.com/Selz/plyr/issues/171
            window.localStorage.removeItem('plyr-volume');

            // load value from the current key
            value = window.localStorage.getItem(config.storage.key);

            if (!value) {
                // Key wasn't set (or had been cleared), move along
                return;
            } else if (/^\d+(\.\d+)?$/.test(value)) {
                // If value is a number, it's probably volume from an older
                // version of plyr. See: https://github.com/Selz/plyr/pull/313
                // Update the key to be JSON
                _updateStorage({volume: parseFloat(value)});
            } else {
                // Assume it's JSON from this or a later version of plyr
                plyr.storage = _extend(plyr.storage, JSON.parse(value));
            }
        }

        // Save a value back to local storage
        function _updateStorage(value) {
            // Update the working copy of the values
            _extend(plyr.storage, value);

            // Bail if we don't have localStorage support or it's disabled
            if (!_support.storage || !config.storage.enabled) {
                return;
            }

            // Update storage
            window.localStorage.setItem(config.storage.key, JSON.stringify(plyr.storage));
        }

        // Setup media
        function _setupMedia() {
            // If there's no media, bail
            if (!plyr.media) {
                _warn('No media element found!');
                return;
            }

            if (plyr.supported.full) {
                // Add type class
                _toggleClass(plyr.container, config.classes.type.replace('{0}', plyr.type), true);

                // Add video class for embeds
                // This will require changes if audio embeds are added
                if (_inArray(config.types.embed, plyr.type)) {
                    _toggleClass(plyr.container, config.classes.type.replace('{0}', 'video'), true);
                }

                // Check for picture-in-picture support
                _toggleClass(plyr.container, config.classes.pip.enabled, _support.pip);

                // If there's no autoplay attribute, assume the video is stopped and add state class
                _toggleClass(plyr.container, config.classes.stopped, config.autoplay);

                // Add iOS class
                _toggleClass(plyr.container, config.classes.isIos, plyr.browser.isIos);

                // Add touch class
                _toggleClass(plyr.container, config.classes.isTouch, plyr.browser.isTouch);

                // Inject the player wrapper
                if (plyr.type === 'video') {
                    // Create the wrapper div
                    var wrapper = document.createElement('div');
                    wrapper.setAttribute('class', config.classes.videoWrapper);

                    // Wrap the video in a container
                    _wrap(plyr.media, wrapper);

                    // Cache the container
                    plyr.videoContainer = wrapper;
                }
            }

            // Embeds
            if (_inArray(config.types.embed, plyr.type)) {
                _setupEmbed();
            }
        }

        // Setup YouTube/Vimeo
        function _setupEmbed() {
            var container = document.createElement('div'),
                mediaId = plyr.embedId,
                id = plyr.type + '-' + Math.floor(Math.random() * (10000));

            // Remove old containers
            var containers = _getElements('[id^="' + plyr.type + '-"]');
            for (var i = containers.length - 1; i >= 0; i--) {
                _remove(containers[i]);
            }

            // Add embed class for responsive
            _toggleClass(plyr.media, config.classes.videoWrapper, true);
            _toggleClass(plyr.media, config.classes.embedWrapper, true);

            if (plyr.type === 'youtube') {
                // Create the YouTube container
                plyr.media.appendChild(container);

                // Set ID
                container.setAttribute('id', id);

                // Setup API
                if (_is.object(window.YT)) {
                    _youTubeReady(mediaId, container);
                } else {
                    // Load the API
                    _injectScript(config.urls.youtube.api);

                    // Setup callback for the API
                    window.onYouTubeReadyCallbacks = window.onYouTubeReadyCallbacks || [];

                    // Add to queue
                    window.onYouTubeReadyCallbacks.push(function() { _youTubeReady(mediaId, container); });

                    // Set callback to process queue
                    window.onYouTubeIframeAPIReady = function () {
                        window.onYouTubeReadyCallbacks.forEach(function(callback) { callback(); });
                    };
                }
            } else if (plyr.type === 'vimeo') {
                // Vimeo needs an extra div to hide controls on desktop (which has full support)
                if (plyr.supported.full) {
                    plyr.media.appendChild(container);
                } else {
                    container = plyr.media;
                }

                // Set ID
                container.setAttribute('id', id);

                // Load the API if not already
                if (!_is.object(window.Vimeo)) {
                    _injectScript(config.urls.vimeo.api);

                    // Wait for fragaloop load
                    var vimeoTimer = window.setInterval(function() {
                        if (_is.object(window.Vimeo)) {
                            window.clearInterval(vimeoTimer);
                            _vimeoReady(mediaId, container);
                        }
                    }, 50);
                } else {
                    _vimeoReady(mediaId, container);
                }
            } else if (plyr.type === 'soundcloud') {
                // TODO: Currently unsupported and undocumented
                // Inject the iframe
                var soundCloud = document.createElement('iframe');

                // Watch for iframe load
                soundCloud.loaded = false;
                _on(soundCloud, 'load', function() { soundCloud.loaded = true; });

                _setAttributes(soundCloud, {
                    'src':  'https://w.soundcloud.com/player/?url=https://api.soundcloud.com/tracks/' + mediaId,
                    'id':   id
                });

                container.appendChild(soundCloud);
                plyr.media.appendChild(container);

                // Load the API if not already
                if (!window.SC) {
                    _injectScript(config.urls.soundcloud.api);
                }

                // Wait for SC load
                var soundCloudTimer = window.setInterval(function() {
                    if (window.SC && soundCloud.loaded) {
                        window.clearInterval(soundCloudTimer);
                        _soundcloudReady.call(soundCloud);
                    }
                }, 50);
            }
        }

        // When embeds are ready
        function _embedReady() {
            // Setup the UI and call ready if full support
            if (plyr.supported.full) {
                _setupInterface();
                _ready();
            }

            // Set title
            _setTitle(_getElement('iframe'));
        }

        // Handle YouTube API ready
        function _youTubeReady(videoId, container) {
            // Setup instance
            // https://developers.google.com/youtube/iframe_api_reference
            plyr.embed = new window.YT.Player(container.id, {
                videoId: videoId,
                playerVars: {
                    autoplay:       (config.autoplay ? 1 : 0),
                    controls:       (plyr.supported.full ? 0 : 1),
                    rel:            0,
                    showinfo:       0,
                    iv_load_policy: 3,
                    cc_load_policy: (config.captions.defaultActive ? 1 : 0),
                    cc_lang_pref:   'en',
                    wmode:          'transparent',
                    modestbranding: 1,
                    disablekb:      1,
                    origin:         '*' // https://code.google.com/p/gdata-issues/issues/detail?id=5788#c45
                },
                events: {
                    'onError': function(event) {
                        _triggerEvent(plyr.container, 'error', true, {
                            code:   event.data,
                            embed:  event.target
                        });
                    },
                    'onReady': function(event) {
                        // Get the instance
                        var instance = event.target;

                        // Create a faux HTML5 API using the YouTube API
                        plyr.media.play = function() {
                            instance.playVideo();
                            plyr.media.paused = false;
                        };
                        plyr.media.pause = function() {
                            instance.pauseVideo();
                            plyr.media.paused = true;
                        };
                        plyr.media.stop = function() {
                            instance.stopVideo();
                            plyr.media.paused = true;
                        };
                        plyr.media.duration = instance.getDuration();
                        plyr.media.paused = true;
                        plyr.media.currentTime = 0;
                        plyr.media.muted = instance.isMuted();

                        // Set title
                        config.title = instance.getVideoData().title;

                        // Set the tabindex
                        if (plyr.supported.full) {
                            plyr.media.querySelector('iframe').setAttribute('tabindex', '-1');
                        }

                        // Update UI
                        _embedReady();

                        // Trigger timeupdate
                        _triggerEvent(plyr.media, 'timeupdate');

                        // Trigger timeupdate
                        _triggerEvent(plyr.media, 'durationchange');

                        // Reset timer
                        window.clearInterval(timers.buffering);

                        // Setup buffering
                        timers.buffering = window.setInterval(function() {
                            // Get loaded % from YouTube
                            plyr.media.buffered = instance.getVideoLoadedFraction();

                            // Trigger progress only when we actually buffer something
                            if (plyr.media.lastBuffered === null || plyr.media.lastBuffered < plyr.media.buffered) {
                                _triggerEvent(plyr.media, 'progress');
                            }

                            // Set last buffer point
                            plyr.media.lastBuffered = plyr.media.buffered;

                            // Bail if we're at 100%
                            if (plyr.media.buffered === 1) {
                                window.clearInterval(timers.buffering);

                                // Trigger event
                                _triggerEvent(plyr.media, 'canplaythrough');
                            }
                        }, 200);
                    },
                    'onStateChange': function(event) {
                        // Get the instance
                        var instance = event.target;

                        // Reset timer
                        window.clearInterval(timers.playing);

                        // Handle events
                        // -1   Unstarted
                        // 0    Ended
                        // 1    Playing
                        // 2    Paused
                        // 3    Buffering
                        // 5    Video cued
                        switch (event.data) {
                            case 0:
                                plyr.media.paused = true;
                                _triggerEvent(plyr.media, 'ended');
                                break;

                            case 1:
                                plyr.media.paused = false;
                                plyr.media.seeking = false;
                                _triggerEvent(plyr.media, 'play');
                                _triggerEvent(plyr.media, 'playing');

                                // Poll to get playback progress
                                timers.playing = window.setInterval(function() {
                                    // Set the current time
                                    plyr.media.currentTime = instance.getCurrentTime();

                                    // Trigger timeupdate
                                    _triggerEvent(plyr.media, 'timeupdate');
                                }, 100);

                                // Check duration again due to YouTube bug
                                // https://github.com/Selz/plyr/issues/374
                                // https://code.google.com/p/gdata-issues/issues/detail?id=8690
                                if (plyr.media.duration !== instance.getDuration()) {
                                    plyr.media.duration = instance.getDuration();
                                    _triggerEvent(plyr.media, 'durationchange');
                                }

                                break;

                            case 2:
                                plyr.media.paused = true;
                                _triggerEvent(plyr.media, 'pause');
                                break;
                        }

                        _triggerEvent(plyr.container, 'statechange', false, {
                            code: event.data
                        });
                    }
                }
            });
        }

        // Vimeo ready
        function _vimeoReady(mediaId, container) {
            // Setup instance
            // https://github.com/vimeo/player.js
            plyr.embed = new window.Vimeo.Player(container, {
                id:         parseInt(mediaId),
                loop:       config.loop,
                autoplay:   config.autoplay,
                byline:     false,
                portrait:   false,
                title:      false
            });

            // Create a faux HTML5 API using the Vimeo API
            plyr.media.play = function() {
                plyr.embed.play();
                plyr.media.paused = false;
            };
            plyr.media.pause = function() {
                plyr.embed.pause();
                plyr.media.paused = true;
            };
            plyr.media.stop = function() {
                plyr.embed.stop();
                plyr.media.paused = true;
            };

            plyr.media.paused = true;
            plyr.media.currentTime = 0;

            // Update UI
            _embedReady();

            plyr.embed.getCurrentTime().then(function(value) {
                plyr.media.currentTime = value;

                // Trigger timeupdate
                _triggerEvent(plyr.media, 'timeupdate');
            });

            plyr.embed.getDuration().then(function(value) {
                plyr.media.duration = value;

                // Trigger timeupdate
                _triggerEvent(plyr.media, 'durationchange');
            });

            // TODO: Captions
            /*if (config.captions.defaultActive) {
                plyr.embed.enableTextTrack('en');
            }*/

            plyr.embed.on('loaded', function() {
                // Fix keyboard focus issues
                // https://github.com/Selz/plyr/issues/317
                if (_is.htmlElement(plyr.embed.element) && plyr.supported.full) {
                    plyr.embed.element.setAttribute('tabindex', '-1');
                }
            });

            plyr.embed.on('play', function() {
                plyr.media.paused = false;
                _triggerEvent(plyr.media, 'play');
                _triggerEvent(plyr.media, 'playing');
            });

            plyr.embed.on('pause', function() {
                plyr.media.paused = true;
                _triggerEvent(plyr.media, 'pause');
            });

            plyr.embed.on('timeupdate', function(data) {
                plyr.media.seeking = false;
                plyr.media.currentTime = data.seconds;
                _triggerEvent(plyr.media, 'timeupdate');
            });

            plyr.embed.on('progress', function(data) {
                plyr.media.buffered = data.percent;
                _triggerEvent(plyr.media, 'progress');

                if (parseInt(data.percent) === 1) {
                    // Trigger event
                    _triggerEvent(plyr.media, 'canplaythrough');
                }
            });

            plyr.embed.on('ended', function() {
                plyr.media.paused = true;
                _triggerEvent(plyr.media, 'ended');
            });
        }

        // Soundcloud ready
        function _soundcloudReady() {
            /* jshint validthis: true */
            plyr.embed = window.SC.Widget(this);

            // Setup on ready
            plyr.embed.bind(window.SC.Widget.Events.READY, function() {
                // Create a faux HTML5 API using the Soundcloud API
                plyr.media.play = function() {
                    plyr.embed.play();
                    plyr.media.paused = false;
                };
                plyr.media.pause = function() {
                    plyr.embed.pause();
                    plyr.media.paused = true;
                };
                plyr.media.stop = function() {
                    plyr.embed.seekTo(0);
                    plyr.embed.pause();
                    plyr.media.paused = true;
                };

                plyr.media.paused = true;
                plyr.media.currentTime = 0;

                plyr.embed.getDuration(function(value) {
                    plyr.media.duration = value/1000;

                    // Update UI
                    _embedReady();
                });

                plyr.embed.getPosition(function(value) {
                    plyr.media.currentTime = value;

                    // Trigger timeupdate
                    _triggerEvent(plyr.media, 'timeupdate');
                });

                plyr.embed.bind(window.SC.Widget.Events.PLAY, function() {
                    plyr.media.paused = false;
                    _triggerEvent(plyr.media, 'play');
                    _triggerEvent(plyr.media, 'playing');
                });

                plyr.embed.bind(window.SC.Widget.Events.PAUSE, function() {
                    plyr.media.paused = true;
                    _triggerEvent(plyr.media, 'pause');
                });

                plyr.embed.bind(window.SC.Widget.Events.PLAY_PROGRESS, function(data) {
                    plyr.media.seeking = false;
                    plyr.media.currentTime = data.currentPosition/1000;
                    _triggerEvent(plyr.media, 'timeupdate');
                });

                plyr.embed.bind(window.SC.Widget.Events.LOAD_PROGRESS, function(data) {
                    plyr.media.buffered = data.loadProgress;
                    _triggerEvent(plyr.media, 'progress');

                    if (parseInt(data.loadProgress) === 1) {
                        // Trigger event
                        _triggerEvent(plyr.media, 'canplaythrough');
                    }
                });

                plyr.embed.bind(window.SC.Widget.Events.FINISH, function() {
                    plyr.media.paused = true;
                    _triggerEvent(plyr.media, 'ended');
                });
            });
        }

        // Play media
        function _play() {
            if ('play' in plyr.media) {
                plyr.media.play();
            }
        }

        // Pause media
        function _pause() {
            // uplynk -- don't pause on live streams
            var isLive = plyr.adaptivePlayer.playlistType === "LIVE";
            if (isLive) {
                return;
            }
            if ('pause' in plyr.media) {
                plyr.media.pause();
            }
        }

        // Toggle playback
        function _togglePlay(toggle) {
            // True toggle
            if (!_is.boolean(toggle)) {
                toggle = plyr.media.paused;
            }

            if(toggle && plyr.media.ended) {
                _seek();
                _play();
            } else if (toggle) {
                _play();
            } else {
                _pause();
            }

            return toggle;
        }

        // Rewind
        function _rewind(seekTime) {
            // Use default if needed
            if (!_is.number(seekTime)) {
                seekTime = config.seekTime;
            }
            _seek(plyr.media.currentTime - seekTime);
        }

        // Fast forward
        function _forward(seekTime) {
            // Use default if needed
            if (!_is.number(seekTime)) {
                seekTime = config.seekTime;
            }
            _seek(plyr.media.currentTime + seekTime);
        }

        // Speed-up
        function _speed(speed) {
            if (!_is.array(config.speeds)) {
                _warn('Invalid speeds format');
                return;
            }
            if (!_is.number(speed)) {
                var index = config.speeds.indexOf(config.currentSpeed);

                if (index !== -1) {
                    var nextIndex = index + 1;
                    if (nextIndex >= config.speeds.length) {
                        nextIndex = 0;
                    }
                    speed = config.speeds[nextIndex];
                } else {
                    speed = config.defaultSpeed;
                }
            }

            // Store current speed
            config.currentSpeed = speed;

            // Set HTML5 speed
            plyr.media.playbackRate = speed;

            // Save speed to localStorage
            _updateStorage({speed: speed});
        }

        // Seek to time
        // The input parameter can be an event or a number
        function _seek(input) {
            var targetTime  = 0,
                paused      = plyr.media.paused,
                duration    = _getDuration();

            if (_is.number(input)) {
                targetTime = input;
            } else if (_is.event(input) && _inArray(['input', 'change'], input.type)) {
                // It's the seek slider
                // Seek to the selected time
                targetTime = ((input.target.value / input.target.max) * duration);
            }

            // Normalise targetTime
            if (targetTime < 0) {
                targetTime = 0;
            } else if (targetTime > duration) {
                targetTime = duration;
            }

            // Update seek range and progress
            _updateSeekDisplay(targetTime);

            // Set the current time
            // Try/catch incase the media isn't set and we're calling seek() from source() and IE moans
            try {
                plyr.media.currentTime = targetTime.toFixed(4);
            }
            catch(e) {}

            // Embeds
            if (_inArray(config.types.embed, plyr.type)) {
                // YouTube
                switch(plyr.type) {
                    case 'youtube':
                        plyr.embed.seekTo(targetTime);
                        break;

                    case 'vimeo':
                        // Round to nearest second for vimeo
                        plyr.embed.setCurrentTime(targetTime.toFixed(0));
                        break;

                    case 'soundcloud':
                        plyr.embed.seekTo(targetTime * 1000);
                        break;
                }

                if (paused) {
                    _pause();
                }

                // Trigger timeupdate for embeds
                _triggerEvent(plyr.media, 'timeupdate');

                // Set seeking flag
                plyr.media.seeking = true;

                // Trigger seeking
                _triggerEvent(plyr.media, 'seeking');
            }

            // Logging
            _log('Seeking to ' + plyr.media.currentTime + ' seconds');

            // Special handling for 'manual' captions
            //_seekManualCaptions(targetTime);
        }

        // Get the duration (or custom if set)
        function _getDuration() {
            // It should be a number, but parse it just incase
            var duration = config.duration;
            if(duration !== Number.POSITIVE_INFINITY && duration !== Number.NEGATIVE_INFINITY) {
                duration = parseInt(duration);
            }

            // True duration
            var mediaDuration = 0;

            // Only if duration available
            if (plyr.media.duration !== null && !isNaN(plyr.media.duration)) {
                mediaDuration = plyr.media.duration;
            }

            // If custom duration is funky, use regular duration
            return (isNaN(duration) ? mediaDuration : duration);
        }

        // Check playing state
        function _checkPlaying() {
            //UP-3283
            _toggleClass(plyr.container, config.classes.playing, !plyr.media.paused || plyr.media.seeking);
            _toggleClass(plyr.container, config.classes.stopped, plyr.media.paused && !plyr.media.seeking);

            _toggleControls(plyr.media.paused);
            _toggleAdOverlay();
        }

        // Save scroll position
        function _saveScrollPosition() {
            scroll = {
                x: window.pageXOffset || 0,
                y: window.pageYOffset || 0
            };
        }

        // Restore scroll position
        function _restoreScrollPosition() {
            window.scrollTo(scroll.x, scroll.y);
        }

        // Toggle fullscreen
        function _toggleFullscreen(event) {
            // Check for native support
            var nativeSupport = _support.fullscreen;

            if (nativeSupport) {
                // If it's a fullscreen change event, update the UI
                if (event && event.type === _fullscreen.eventType) {
                    plyr.isFullscreen = _fullscreen.isFullScreen(plyr.container);
                } else {
                    // Else it's a user request to enter or exit
                    if (!_fullscreen.isFullScreen(plyr.container)) {
                        // Save scroll position
                        _saveScrollPosition();

                        // Request full screen
                        _fullscreen.requestFullScreen(plyr.container);
                    } else {
                        // Bail from fullscreen
                        _fullscreen.cancelFullScreen();
                    }

                    // Check if we're actually full screen (it could fail)
                    plyr.isFullscreen = _fullscreen.isFullScreen(plyr.container);

                    return;
                }
            } else {
                // Otherwise, it's a simple toggle
                plyr.isFullscreen = !plyr.isFullscreen;

                // Bind/unbind escape key
                document.body.style.overflow = plyr.isFullscreen ? 'hidden' : '';
            }

            // Set class hook
            _toggleClass(plyr.container, config.classes.fullscreen.active, plyr.isFullscreen);

            // Trap focus
            _focusTrap(plyr.isFullscreen);

            // Set button state
            if (plyr.buttons && plyr.buttons.fullscreen) {
                _toggleState(plyr.buttons.fullscreen, plyr.isFullscreen);
            }

            // Trigger an event
            _triggerEvent(plyr.container, plyr.isFullscreen ? 'enterfullscreen' : 'exitfullscreen', true);

            // Restore scroll position
            if (!plyr.isFullscreen && nativeSupport) {
                _restoreScrollPosition();
            }
        }

        // Mute
        function _toggleMute(muted) {
            // If the method is called without parameter, toggle based on current value
            if (!_is.boolean(muted)) {
                muted = !plyr.media.muted;
            }

            // Set button state
            _toggleState(plyr.buttons.mute, muted);

            // Set mute on the player
            plyr.media.muted = muted;

            // If volume is 0 after unmuting, set to default
            if (plyr.media.volume === 0) {
                _setVolume(config.volume);
            }

            // Embeds
            if (_inArray(config.types.embed, plyr.type)) {
                // YouTube
                switch(plyr.type) {
                    case 'youtube':
                        plyr.embed[plyr.media.muted ? 'mute' : 'unMute']();
                        break;

                    case 'vimeo':
                    case 'soundcloud':
                        plyr.embed.setVolume(plyr.media.muted ? 0 : parseFloat(config.volume / config.volumeMax));
                        break;
                }

                // Trigger volumechange for embeds
                _triggerEvent(plyr.media, 'volumechange');
            }
        }

        // Set volume
        function _setVolume(volume) {
            var max = config.volumeMax,
                min = config.volumeMin;

            // Load volume from storage if no value specified
            if (_is.undefined(volume)) {
                volume = plyr.storage.volume;
            }

            // Use config if all else fails
            if (volume === null || isNaN(volume)) {
                volume = config.volume;
            }

            // Maximum is volumeMax
            if (volume > max) {
                volume = max;
            }
            // Minimum is volumeMin
            if (volume < min) {
                volume = min;
            }

            // Set the player volume
            plyr.media.volume = parseFloat(volume / max);

            // Set the display
            if (plyr.volume.display) {
                plyr.volume.display.value = volume;
            }

            // Embeds
            if (_inArray(config.types.embed, plyr.type)) {
                switch(plyr.type) {
                    case 'youtube':
                        plyr.embed.setVolume(plyr.media.volume * 100);
                        break;

                    case 'vimeo':
                    case 'soundcloud':
                        plyr.embed.setVolume(plyr.media.volume);
                        break;
                }

                // Trigger volumechange for embeds
                _triggerEvent(plyr.media, 'volumechange');
            }

            // Toggle muted state
            if (volume === 0) {
                plyr.media.muted = true;
            } else if (plyr.media.muted && volume > 0) {
                _toggleMute();
            }
        }

        // Increase volume
        function _increaseVolume(step) {
            var volume = plyr.media.muted ? 0 : (plyr.media.volume * config.volumeMax);

            if (!_is.number(step)) {
                step = config.volumeStep;
            }

            _setVolume(volume + step);
        }

        // Decrease volume
        function _decreaseVolume(step) {
            var volume = plyr.media.muted ? 0 : (plyr.media.volume * config.volumeMax);

            if (!_is.number(step)) {
                step = config.volumeStep;
            }

            _setVolume(volume - step);
        }

        // Update volume UI and storage
        function _updateVolume() {
            // Get the current volume
            var volume = plyr.media.muted ? 0 : (plyr.media.volume * config.volumeMax);

            // Update the <input type="range"> if present
            if (plyr.supported.full) {
                if (plyr.volume.input) {
                    plyr.volume.input.value = volume;
                }
                if (plyr.volume.display) {
                    plyr.volume.display.value = volume;
                }
            }

            // Update the volume in storage
            _updateStorage({volume: volume});

            // Toggle class if muted
            _toggleClass(plyr.container, config.classes.muted, (volume === 0));

            // Update checkbox for mute state
            if (plyr.supported.full && plyr.buttons.mute) {
                _toggleState(plyr.buttons.mute, (volume === 0));
            }
        }

        // Toggle captions
        function _toggleCaptions(show) {
            // If there's no full support, or there's no caption toggle
            if (!plyr.supported.full || !plyr.buttons.captions) {
                return;
            }

            // If the method is called without parameter, toggle based on current value
            if (!_is.boolean(show)) {
                show = (plyr.container.className.indexOf(config.classes.captions.active) === -1);
            }

            // Set global
            plyr.captionsEnabled = show;

            // Toggle state
            _toggleState(plyr.buttons.captions, plyr.captionsEnabled);

            // Add class hook
            _toggleClass(plyr.container, config.classes.captions.active, plyr.captionsEnabled);

            // Trigger an event
            _triggerEvent(plyr.container, plyr.captionsEnabled ? 'captionsenabled' : 'captionsdisabled', true);

            // Save captions state to localStorage
            _updateStorage({captionsEnabled: plyr.captionsEnabled});
        }

        // Select active caption
        function _setCaptionIndex(index) {
            // Save active caption
            config.captions.selectedIndex = index;

            var subtitleTracks = plyr.media.textTracks;
            var trackLabel = config.i18n.none;

            //select caption track. setting the mode on the track triggers
            // a TextTrack 'change' event (except in IE and Edge)
            for (var i = 0; i < subtitleTracks.length; i++) {
                if (subtitleTracks[i].kind === "subtitles" || subtitleTracks[i].kind === "captions") {
                    if (i == index) {
                        subtitleTracks[i].mode = "showing";
                        trackLabel = subtitleTracks[i].label;
                    } else {
                        subtitleTracks[i].mode = "disabled";
                    }
                }
            }

            //MS IE and Edge don't support TextTrack changed event
            //https://connect.microsoft.com/IE/feedbackdetail/view/1660701/text-tracks-do-not-fire-change-addtrack-or-removetrack-events
            if (plyr.browser.isIE || plyr.browser.isEdge) {
                plyr.adaptivePlayer.onTextTrackChanged({ currentTarget: subtitleTracks, target: subtitleTracks, type: 'change' });
            }

            _updateSelectedCaptionTrack(trackLabel);
        }

        // Check if media is loading
        function _checkLoading(event) {
            var loading = (event.type === 'waiting');

            // Clear timer
            clearTimeout(timers.loading);

            // Timer to prevent flicker when seeking
            timers.loading = setTimeout(function() {
                // Toggle container class hook
                _toggleClass(plyr.container, config.classes.loading, loading);

                // Show controls if loading, hide if done
                _toggleControls(loading);

                _toggleAdOverlay();
            }, (loading ? 250 : 0));
        }

        // Update <progress> elements
        function _updateProgress(event) {
            if (!plyr.supported.full) {
                return;
            }

            var progress    = plyr.progress.played,
                value       = 0,
                duration    = _getDuration();

            if (event) {
                switch (event.type) {
                    // Video playing
                    case 'timeupdate':
                    case 'seeking':
                        if (plyr.controls.pressed) {
                            return;
                        }

                        value = _getPercentage(plyr.media.currentTime, duration);

                        // Set seek range value only if it's a 'natural' time event
                        if (event.type === 'timeupdate' && plyr.buttons.seek) {
                            plyr.buttons.seek.value = value;
                        }

                        break;

                    // Check buffer status
                    case 'playing':
                    case 'progress':
                        progress    = plyr.progress.buffer;
                        value       = (function() {
                            var buffered = plyr.media.buffered;

                            if (buffered && buffered.length) {
                                // HTML5
                                var currentTime = plyr.media.currentTime;
                                var maxGap = 0.5;
                                var lastEnd = buffered.end(0);

                                for(var i = 0; i < buffered.length; i++) {
                                    var start = buffered.start(i);
                                    var end = buffered.end(i);

                                    if(currentTime >= start && currentTime <= end) {
                                        lastEnd = end;

                                        //found where we are buffered before and after currentTime,
                                        // now let's see if there is an adjacent buffer just a small
                                        // gap away
                                        for (i++; i < buffered.length; i++) {
                                            var previousEnd = end;
                                            start = buffered.start(i);
                                            end = buffered.end(i);

                                            if (start - previousEnd <= maxGap) {
                                                lastEnd = end;
                                            }
                                        }
                                    }
                                }

                                return _getPercentage(lastEnd, duration);
                            } else if (_is.number(buffered)) {
                                // YouTube returns between 0 and 1
                                return (buffered * 100);
                            }

                            return 0;
                        })();

                        break;
                }
            }

            // Set values
            _setProgress(progress, value);
        }

        // Set <progress> value
        function _setProgress(progress, value) {
            if (!plyr.supported.full) {
                return;
            }

            // Default to 0
            if (_is.undefined(value)) {
                value = 0;
            }
            // Default to buffer or bail
            if (_is.undefined(progress)) {
                if (plyr.progress && plyr.progress.buffer) {
                    progress = plyr.progress.buffer;
                } else {
                    return;
                }
            }

            // One progress element passed
            if (_is.htmlElement(progress)) {
                progress.value = value;
            } else if (progress) {
                // Object of progress + text element
                if (progress.bar) {
                    progress.bar.value = value;
                }
                if (progress.text) {
                    progress.text.innerHTML = value;
                }
            }
        }

        // Update the displayed time
        function _updateTimeDisplay(time, element) {
            // Bail if there's no duration display
            if (!element) {
                return;
            }

            // Fallback to 0
            if (isNaN(time)) {
                time = 0;
            }

            plyr.secs = parseInt(time % 60);
            plyr.mins = parseInt((time / 60) % 60);
            plyr.hours = parseInt(((time / 60) / 60) % 60);

            // Do we need to display hours?
            var displayHours = (parseInt(((_getDuration() / 60) / 60) % 60) > 0);

            // Ensure it's two digits. For example, 03 rather than 3.
            plyr.secs = ('0' + plyr.secs).slice(-2);
            plyr.mins = ('0' + plyr.mins).slice(-2);

            // Render
            element.innerHTML = (displayHours ? plyr.hours + ':' : '') + plyr.mins + ':' + plyr.secs;
        }

        // Show the duration on metadataloaded
        function _displayDuration() {
            if (!plyr.supported.full) {
                return;
            }

            // Determine duration
            var duration = _getDuration() || 0;

            // If there's only one time display, display duration there
            if (!plyr.duration && config.displayDuration && plyr.media.paused) {
                _updateTimeDisplay(duration, plyr.currentTime);
            }

            // If there's a duration element, update content
            if (plyr.duration) {
                _updateTimeDisplay(duration, plyr.duration);
            }

            // Update the tooltip (if visible)
            _updateSeekTooltip();
        }

        // Handle time change event
        function _timeUpdate(event) {
            // Duration
            _updateTimeDisplay(plyr.media.currentTime, plyr.currentTime);

            if(plyr.inAd) {
                _updateAdOverlay();
            }

            // Ignore updates while seeking
            if (event && event.type === 'timeupdate' && plyr.media.seeking) {
                return;
            }

            // Playing progress
            _updateProgress(event);
        }

        // Update seek range and progress
        function _updateSeekDisplay(time) {
            // Default to 0
            if (!_is.number(time)) {
                time = 0;
            }

            var duration    = _getDuration(),
                value       = _getPercentage(time, duration);

            // Update progress
            if (plyr.progress && plyr.progress.played) {
                plyr.progress.played.value = value;
            }

            // Update seek range input
            if (plyr.buttons && plyr.buttons.seek) {
                plyr.buttons.seek.value = value;
            }
        }

        // Update hover tooltip for seeking
        function _updateSeekTooltip(event) {
            var now = Date.now();
            var duration = _getDuration();

            // Bail if setting not true
            if (!config.tooltips.seek || !plyr.progress.container || duration === 0) {
                return;
            }

            // Calculate percentage
            var clientRect  = plyr.progress.container.getBoundingClientRect(),
                percent     = 0,
                visible     = config.classes.tooltip + '--visible';

            // Determine percentage, if already visible
            if (!event) {
                if (_hasClass(plyr.progress.seek.container, visible)) {
                    percent = plyr.progress.seek.container.style.left.replace('%', '');
                } else {
                    return;
                }
            } else {
                percent = (event.offsetX / event.target.clientWidth) * 100;
            }

            // Set bounds
            if (percent < 0) {
                percent = 0;
            } else if (percent > 100) {
                percent = 100;
            }

            var time = parseInt(((duration / 100) * percent));

            // Only send thumbnail event on time change
            if(plyr.time !== time) {

                // Only send thumbnail event if it's been longer than 250ms since our last
                // thumbnail event.  This helps to prevent spamming the server with image requests
                // when the user moves the mouse along the timeline.
                if (!plyr.lastUpdatedThumbnail || now - plyr.lastUpdatedThumbnail > 250) {

                    plyr.lastUpdatedThumbnail = now;

                    if(config.showThumbnails) {
                        _triggerEvent(plyr.media, 'thumbnail', true, {time: time, img: plyr.progress.seek.thumbnail});
                    }
                }

                // Display the time a click would seek to
                _updateTimeDisplay(time, plyr.progress.seek.tooltip);
            }

            plyr.time = time;

            if (event && event.type === 'mouseup' && plyr.adaptivePlayer && plyr.adaptivePlayer.canSeek()) {
                _seek(time);
            }

            if (_inArray(config.controls, 'progress')) {
                // Set position
                plyr.progress.seek.container.style.left = percent + "%";
            }

            // Show/hide the tooltip
            // If the event is a moues in/out and percentage is inside bounds
            if (event && _inArray(['mouseenter', 'mouseleave'], event.type)) {
                _toggleClass(plyr.progress.seek.container, visible, (event.type === 'mouseenter'));
            }
        }

        // Set playback speed
        function _setSpeed(speed) {
            // Load speed from storage or default value
            if (_is.undefined(speed)) {
                speed = plyr.storage.speed || config.defaultSpeed;
            }

            _speed(speed);
        }

        function _adEntered(asset) {
            if (asset.isAd) {
                if (asset.adData && asset.adData.click && asset.adData.click.length > 0) {
                    if(asset.adData.click[0]) {
                        var parent = plyr.adDuration.parentElement;
                        //add separator
                        var dash = document.createElement('span');
                        dash.setAttribute('class', 'plyr__time--ad-duration');
                        dash.innerText = ' - ';
                        parent.appendChild(dash);

                        //add 'More Info' link
                        var moreInfo = document.createElement('a');
                        moreInfo.setAttribute('class', 'plyr__time--ad-duration');
                        moreInfo.setAttribute('target', '_blank');
                        moreInfo.setAttribute('href', asset.adData.click[0]);
                        moreInfo.text = config.i18n.adClick;
                        parent.appendChild(moreInfo);
                    }
                }
            }
        }

        function _adExited(asset) {
            if (asset.isAd) {
                if (asset.adData && asset.adData.click && asset.adData.click.length > 0) {
                    if(asset.adData.click[0]) {
                        var parent = plyr.adDuration.parentElement;
                        if (parent.lastChild.tagName.toLowerCase() === 'a') {
                            //remove 'More Info' link
                            parent.removeChild(parent.lastChild);
                            //remove separator
                            parent.removeChild(parent.lastChild);
                        }
                    }
                }
            }
        }

        function _toggleAdOverlay() {
            if(!_is.boolean(plyr.inAd)) {
                plyr.inAd = false;
            }

            _toggleClass(plyr.container, config.classes.hideAdOverlay, !plyr.inAd);

            if(plyr.adaptivePlayer) {
                var canSeek = plyr.adaptivePlayer.canSeek();
                _toggleClass(plyr.buttons.seek, config.classes.hideSeekButton, !canSeek);
            }
        }

        // Show the player controls in fullscreen mode
        function _toggleControls(toggle) {
            // Don't hide if config says not to, it's audio, or not ready or loading
            if (!config.hideControls || plyr.type === 'audio') {
                return;
            }

            var delay = 0,
                isEnterFullscreen = false,
                show = toggle,
                loading = _hasClass(plyr.container, config.classes.loading);

            // Default to false if no boolean
            if (!_is.boolean(toggle)) {
                if (toggle && toggle.type) {
                    // Is the enter fullscreen event
                    isEnterFullscreen = (toggle.type === 'enterfullscreen');

                    // Whether to show controls
                    show = _inArray(['mousemove', 'touchstart', 'mouseenter', 'focus'], toggle.type);

                    // Delay hiding on move events
                    if (_inArray(['mousemove', 'touchmove'], toggle.type)) {
                        delay = 2000;
                    }

                    // Delay a little more for keyboard users
                    if (toggle.type === 'focus') {
                        delay = 3000;
                    }
                } else {
                    show = _hasClass(plyr.container, config.classes.hideControls);
                }
            }

            // Clear timer every movement
            window.clearTimeout(timers.hover);

            // If the mouse is not over the controls, set a timeout to hide them
            if (show || plyr.media.paused || loading) {
                _toggleClass(plyr.container, config.classes.hideControls, false);

                // Always show controls when paused or if touch
                if (plyr.media.paused || loading) {
                    return;
                }

                // Delay for hiding on touch
                if (plyr.browser.isTouch) {
                    delay = 3000;
                }
            }

            // If toggle is false or if we're playing (regardless of toggle),
            // then set the timer to hide the controls
            if (!show || !plyr.media.paused) {
                timers.hover = window.setTimeout(function() {
                    // If the mouse is over the controls (and not entering fullscreen), bail
                    if ((plyr.controls.pressed || plyr.controls.hover) && !isEnterFullscreen) {
                        return;
                    }

                    _toggleClass(plyr.container, config.classes.hideControls, true);
                }, delay);
            }
        }

        // Add common function to retrieve media source
        function _source(source) {
            // If not null or undefined, parse it
            if (!_is.undefined(source)) {
                _updateSource(source);
                return;
            }

            // Return the current source
            var url;
            switch(plyr.type) {
                case 'youtube':
                    url = plyr.embed.getVideoUrl();
                    break;

                case 'vimeo':
                    plyr.embed.getVideoUrl.then(function (value) {
                        url = value;
                    });
                    break;

                case 'soundcloud':
                    plyr.embed.getCurrentSound(function(object) {
                        url = object.permalink_url;
                    });
                    break;

                default:
                    url = plyr.media.currentSrc;
                    break;
            }

            return url || '';
        }

        // Update source
        // Sources are not checked for support so be careful
        function _updateSource(source) {
            if (!_is.object(source) || !('sources' in source) || !source.sources.length) {
                _warn('Invalid source format');
                return;
            }

            // Remove ready class hook
            _toggleClass(plyr.container, config.classes.ready, false);

            // Pause playback
            _pause();

            // Update seek range and progress
            _updateSeekDisplay();

            // Reset buffer progress
            _setProgress();

            // Cancel current network requests
            _cancelRequests();

            // Setup new source
            function setup() {
                // Remove embed object
                plyr.embed = null;

                // Remove the old media
                _remove(plyr.media);

                // Remove video container
                if (plyr.type === 'video' && plyr.videoContainer) {
                    _remove(plyr.videoContainer);
                }

                // Reset class name
                if (plyr.container) {
                    plyr.container.removeAttribute('class');
                }

                // Set the type
                if ('type' in source) {
                    plyr.type = source.type;

                    // Get child type for video (it might be an embed)
                    if (plyr.type === 'video') {
                        var firstSource = source.sources[0];

                        if ('type' in firstSource && _inArray(config.types.embed, firstSource.type)) {
                            plyr.type = firstSource.type;
                        }
                    }
                }

                // Check for support
                plyr.supported = supported(plyr.type);

                // Create new markup
                switch(plyr.type) {
                    case 'video':
                        plyr.media = document.createElement('video');
                        break;

                    case 'audio':
                        plyr.media = document.createElement('audio');
                        break;

                    case 'youtube':
                    case 'vimeo':
                    case 'soundcloud':
                        plyr.media = document.createElement('div');
                        plyr.embedId = source.sources[0].src;
                        break;
                }

                // Inject the new element
                _prependChild(plyr.container, plyr.media);

                // Autoplay the new source?
                if (_is.boolean(source.autoplay)) {
                    config.autoplay = source.autoplay;
                }

                // Set attributes for audio and video
                if (_inArray(config.types.html5, plyr.type)) {
                    if (config.crossorigin) {
                        plyr.media.setAttribute('crossorigin', '');
                    }
                    if (config.autoplay) {
                        plyr.media.setAttribute('autoplay', '');
                    }
                    if ('poster' in source) {
                        plyr.media.setAttribute('poster', source.poster);
                    }
                    if (config.loop) {
                        plyr.media.setAttribute('loop', '');
                    }
                }

                // Restore class hooks
                _toggleClass(plyr.container, config.classes.fullscreen.active, plyr.isFullscreen);
                _toggleClass(plyr.container, config.classes.captions.active, plyr.captionsEnabled);
                _toggleStyleHook();

                // Set new sources for html5
                if (_inArray(config.types.html5, plyr.type)) {
                    _insertChildElements('source', source.sources);
                }

                // Set up from scratch
                _setupMedia();

                // HTML5 stuff
                if (_inArray(config.types.html5, plyr.type)) {
                    // Setup captions
                    if ('tracks' in source) {
                        _insertChildElements('track', source.tracks);
                    }

                    // Load HTML5 sources
                    plyr.media.load();
                }

                // If HTML5 or embed but not fully supported, setupInterface and call ready now
                if (_inArray(config.types.html5, plyr.type) || (_inArray(config.types.embed, plyr.type) && !plyr.supported.full)) {
                    // Setup interface
                    _setupInterface();

                    // Call ready
                    _ready();
                }

                // Set aria title and iframe title
                config.title = source.title;
                _setTitle();
            }

            // Destroy instance adn wait for callback
            // Vimeo throws a wobbly if you don't wait
            _destroy(setup, false);
        }

        // Update poster
        function _updatePoster(source) {
            if (plyr.type === 'video') {
                plyr.media.setAttribute('poster', source);
            }
        }

        // Listen for control events
        function _controlListeners() {
            // IE doesn't support input event, so we fallback to change
            var inputEvent = (plyr.browser.isIE ? 'change' : 'input');

            // Click play/pause helper
            function togglePlay() {
                var play = _togglePlay();

                // Determine which buttons
                var trigger = plyr.buttons[play ? 'play' : 'pause'],
                    target = plyr.buttons[play ? 'pause' : 'play'];

                // Get the last play button to account for the large play button
                if (target && target.length > 1) {
                    target = target[target.length - 1];
                } else {
                    target = target[0];
                }

                // Setup focus and tab focus
                if (target) {
                    var hadTabFocus = _hasClass(trigger, config.classes.tabFocus);

                    setTimeout(function() {
                        target.focus();

                        if (hadTabFocus) {
                            _toggleClass(trigger, config.classes.tabFocus, false);
                            _toggleClass(target, config.classes.tabFocus, true);
                        }
                    }, 100);
                }
            }

            // Get the focused element
            function getFocusElement() {
                var focused = document.activeElement;

                if (!focused || focused === document.body) {
                    focused = null;
                } else {
                    focused = document.querySelector(':focus');
                }

                return focused;
            }

            // Get the key code for an event
            function getKeyCode(event) {
                return event.keyCode ? event.keyCode : event.which;
            }

            // Detect tab focus
            function checkTabFocus(focused) {
                for (var button in plyr.buttons) {
                    var element = plyr.buttons[button];

                    if (_is.nodeList(element)) {
                        for (var i = 0; i < element.length; i++) {
                            _toggleClass(element[i], config.classes.tabFocus, (element[i] === focused));
                        }
                    } else {
                        _toggleClass(element, config.classes.tabFocus, (element === focused));
                    }
                }
            }

            // Keyboard shortcuts
            if (config.keyboardShorcuts.focused) {
                var last = null;

                // Handle global presses
                if (config.keyboardShorcuts.global) {
                    _on(window, 'keydown keyup', function(event) {
                        var code = getKeyCode(event),
                        focused = getFocusElement(),
                        allowed = [48,49,50,51,52,53,54,56,57,75,77,70,67],
                        count   = get().length;

                        // Only handle global key press if there's only one player
                        // and the key is in the allowed keys
                        // and if the focused element is not editable (e.g. text input)
                        // and any that accept key input http://webaim.org/techniques/keyboard/
                        if (count === 1 && _inArray(allowed, code) && (!_is.htmlElement(focused) || !_matches(focused, config.selectors.editable))) {
                            handleKey(event);
                        }
                    });
                }

                // Handle presses on focused
                _on(plyr.container, 'keydown keyup', handleKey);
            }

            function handleKey(event) {
                var code = getKeyCode(event),
                    pressed = event.type === 'keydown',
                    held = pressed && code === last;

                // If the event is bubbled from the media element
                // Firefox doesn't get the keycode for whatever reason
                if (!_is.number(code)) {
                    return;
                }

                // Seek by the number keys
                function seekByKey() {
                    // Get current duration
                    var duration = plyr.media.duration;

                    // Bail if we have no duration set
                    if (!_is.number(duration)) {
                        return;
                    }

                    // Divide the max duration into 10th's and times by the number value
                    _seek((duration / 10) * (code - 48));
                }

                // Handle the key on keydown
                // Reset on keyup
                if (pressed) {
                    // Which keycodes should we prevent default
                    var preventDefault = [48,49,50,51,52,53,54,56,57,32,75,38,40,77,39,37,70,67];

                    // If the code is found prevent default (e.g. prevent scrolling for arrows)
                    if (_inArray(preventDefault, code)) {
                        event.preventDefault();
                        event.stopPropagation();
                    }

                    switch(code) {
                        // 0-9
                        case 48:
                        case 49:
                        case 50:
                        case 51:
                        case 52:
                        case 53:
                        case 54:
                        case 55:
                        case 56:
                        case 57: if (!held) { seekByKey(); } break;
                        // Space and K key
                        case 32:
                        case 75: if (!held) { _togglePlay(); } break;
                        // Arrow up
                        case 38: _increaseVolume(); break;
                        // Arrow down
                        case 40: _decreaseVolume(); break;
                        // M key
                        case 77: if (!held) { _toggleMute() } break;
                        // Arrow forward
                        case 39: _forward(); break;
                        // Arrow back
                        case 37: _rewind(); break;
                        // F key
                        case 70: _toggleFullscreen(); break;
                        // C key
                        case 67: if (!held) { _toggleCaptions(); } break;
                    }

                    // Escape is handle natively when in full screen
                    // So we only need to worry about non native
                    if (!_support.fullscreen && plyr.isFullscreen && code === 27) {
                        _toggleFullscreen();
                    }

                    // Store last code for next cycle
                    last = code;
                } else {
                    last = null;
                }
            }

            // Focus/tab management
            _on(window, 'keyup', function(event) {
                var code = getKeyCode(event),
                    focused = getFocusElement();

                if (code === 9) {
                    checkTabFocus(focused);
                }
            });
            _on(document.body, 'click', function() {
                _toggleClass(_getElement('.' + config.classes.tabFocus), config.classes.tabFocus, false);
            });
            for (var button in plyr.buttons) {
                var element = plyr.buttons[button];

                _on(element, 'blur', function() {
                    _toggleClass(element, 'tab-focus', false);
                });
            }

            // Play
            _proxyListener(plyr.buttons.play, 'click', config.listeners.play, togglePlay);

            // Pause
            _proxyListener(plyr.buttons.pause, 'click', config.listeners.pause, togglePlay);

            // Restart
            _proxyListener(plyr.buttons.restart, 'click', config.listeners.restart, _seek);

            // Rewind
            _proxyListener(plyr.buttons.rewind, 'click', config.listeners.rewind, _rewind);

            // Fast forward
            _proxyListener(plyr.buttons.forward, 'click', config.listeners.forward, _forward);

            // Speed-up
            _proxyListener(plyr.buttons.speed, 'click', config.listeners.speed, _speed);

            // Seek
            // uplynk - don't listen for events because we trigger seek manually
            //_proxyListener(plyr.buttons.seek, inputEvent, config.listeners.seek, _seek);

            // Set volume
            _proxyListener(plyr.volume.input, inputEvent, config.listeners.volume, function() {
                _setVolume(plyr.volume.input.value);
            });

            // Mute
            _proxyListener(plyr.buttons.mute, 'click', config.listeners.mute, _toggleMute);

            // Fullscreen
            _proxyListener(plyr.buttons.fullscreen, 'click', config.listeners.fullscreen, _toggleFullscreen);

            // Handle user exiting fullscreen by escaping etc
            if (_support.fullscreen) {
                _on(document, _fullscreen.eventType, _toggleFullscreen);
            }

            // Captions
            _on(plyr.buttons.captions, 'click', _toggleCaptions);

            // Settings
            _on(plyr.buttons.settings, 'click', function(event) {
                var menu = this;
                var toggle = event.target;
                var target;
                var show;

                //hack to get around mouse click events fired on 'svg' and 'use' tags.
                // should be fixed by css
                if(toggle.tagName && toggle.tagName.toLowerCase() === 'use') {
                    toggle = toggle.parentNode;
                }

                if(toggle.tagName && toggle.tagName.toLowerCase() === 'svg') {
                    toggle = toggle.parentNode;
                }

                if(toggle.constructor && toggle.constructor.name === 'SVGElementInstance') {
                    toggle = _getElement('#plyr-settings-toggle-' + plyr.id);
                }

                if(!toggle.getAttribute) {
                    return;
                }
                //end hack

                target = document.getElementById(toggle.getAttribute('aria-controls')),
                show = (toggle.getAttribute('aria-expanded') === 'false');

                // Nothing to show, bail
                if (!_is.htmlElement(target)) {
                    return;
                }

                // Are we targetting a tab?
                var isTab = target.getAttribute('role') === 'tabpanel',
                    targetWidth,
                    targetHeight,
                    container;

                // Hide all other tabs
                if (isTab) {
                    // Get other tabs
                    var current = menu.querySelector('[role="tabpanel"][aria-hidden="false"]');
                    container = current.parentNode;

                    [].forEach.call(menu.querySelectorAll('[aria-controls="' + current.getAttribute('id') + '"]'), function(toggle) {
                        toggle.setAttribute('aria-expanded', false);
                    });

                    container.style.width = current.scrollWidth + 'px';
                    container.style.height = current.scrollHeight + 'px';

                    current.setAttribute('aria-hidden', true);
                    current.setAttribute('tabindex', -1);

                    // Get the natural element size
                    var clone = target.cloneNode(true);
                    clone.style.position = "absolute";
                    clone.style.opacity = 0;
                    clone.setAttribute('aria-hidden', false);
                    container.appendChild(clone);
                    targetWidth = clone.scrollWidth;
                    targetHeight = clone.scrollHeight;
                    _remove(clone);
                }

                target.setAttribute('aria-hidden', !show);
                toggle.setAttribute('aria-expanded', show);
                target.setAttribute('tabindex', 0);

                if (isTab) {
                    container.style.width = targetWidth + 'px';
                    container.style.height = targetHeight + 'px';

                    window.setTimeout(function() {
                        container.style.width = '';
                        container.style.height = '';
                    }, 300);
                }
            });

            // Picture in picture
            _on(plyr.buttons.pip, 'click', function() {
                //if ()

                plyr.media.webkitSetPresentationMode(plyr.media.webkitPresentationMode === 'picture-in-picture' ? 'inline' : 'picture-in-picture');
            });

            // Seek tooltip
            _on(plyr.progress.container, 'mouseenter mouseleave mousemove mouseup', _updateSeekTooltip);

            // Toggle controls visibility based on mouse movement
            if (config.hideControls) {
                // Toggle controls on mouse events and entering fullscreen
                _on(plyr.container, 'mouseenter mouseleave mousemove touchstart touchend touchcancel touchmove enterfullscreen', _toggleControls);

                // Watch for cursor over controls so they don't hide when trying to interact
                _on(plyr.controls, 'mouseenter mouseleave', function(event) {
                    plyr.controls.hover = event.type === 'mouseenter';
                });

                 // Watch for cursor over controls so they don't hide when trying to interact
                _on(plyr.controls, 'mousedown mouseup touchstart touchend touchcancel', function(event) {
                    plyr.controls.pressed = _inArray(['mousedown', 'touchstart'], event.type);
                });

                // Focus in/out on controls
                _on(plyr.controls, 'focus blur', _toggleControls, true);
            }

            // Adjust volume on scroll
            _on(plyr.volume.input, 'wheel', function(event) {
                event.preventDefault();

                // Detect "natural" scroll - suppored on OS X Safari only
                // Other browsers on OS X will be inverted until support improves
                var inverted = event.webkitDirectionInvertedFromDevice,
                    step = (config.volumeStep / 5);

                // Scroll down (or up on natural) to decrease
                if (event.deltaY < 0 || event.deltaX > 0) {
                    if (inverted) {
                        _decreaseVolume(step);
                    } else {
                        _increaseVolume(step);
                    }
                }

                // Scroll up (or down on natural) to increase
                if (event.deltaY > 0 || event.deltaX < 0) {
                    if (inverted) {
                        _increaseVolume(step);
                    } else {
                        _decreaseVolume(step);
                    }
                }
            });
        }

        // Listen for media events
        function _mediaListeners() {
            // Time change on media
            _on(plyr.media, 'timeupdate seeking', _timeUpdate);

            // Display duration
            _on(plyr.media, 'durationchange loadedmetadata', _displayDuration);

            // Handle the media finishing
            _on(plyr.media, 'ended', function() {
                // Show poster on end
                if (plyr.type === 'video' && config.showPosterOnEnd) {
                    // Restart
                    _seek();

                    // Re-load media
                    plyr.media.load();
                }
            });

            // Check for buffer progress
            _on(plyr.media, 'progress playing', _updateProgress);

            // Handle native mute
            _on(plyr.media, 'volumechange', _updateVolume);

            // Handle native play/pause
            _on(plyr.media, 'play pause ended', _checkPlaying);

            // Loading
            _on(plyr.media, 'waiting canplay seeked', _checkLoading);

            // Click video
            if (config.clickToPlay && plyr.type !== 'audio') {
                // Re-fetch the wrapper
                var wrapper = _getElement('.' + config.classes.videoWrapper);

                // Bail if there's no wrapper (this should never happen)
                if (!wrapper) {
                    return;
                }

                // Set cursor
                wrapper.style.cursor = "pointer";

                // On click play, pause or restart
                _on(wrapper, 'click', _onVideoWrapperClick);
            }

            // Disable right click
            if (config.disableContextMenu) {
                _on(plyr.media, 'contextmenu', function(event) { event.preventDefault(); });
            }

            // Proxy events to container
            // Bubble up key events for Edge
            _on(plyr.media, config.events.concat(['keyup', 'keydown']).join(' '), function(event) {
                _triggerEvent(plyr.container, event.type, true);
            });
        }

        function _onVideoWrapperClick() {
            // Touch devices will just show controls (if we're hiding controls)
            if (config.hideControls && plyr.browser.isTouch && !plyr.media.paused) {
                return;
            }

            if (plyr.media.paused && !plyr.media.ended) {
                _play();
            } else if (plyr.media.ended) {
                _seek();
                _play();
            } else {
                _pause();
            }
        }

        // Cancel current network requests
        // See https://github.com/Selz/plyr/issues/174
        function _cancelRequests() {
            if (!_inArray(config.types.html5, plyr.type)) {
                return;
            }

            // Remove child sources
            var sources = plyr.media.querySelectorAll('source');
            for (var i = 0; i < sources.length; i++) {
                _remove(sources[i]);
            }

            // Set blank video src attribute
            // This is to prevent a MEDIA_ERR_SRC_NOT_SUPPORTED error
            // Info: http://stackoverflow.com/questions/32231579/how-to-properly-dispose-of-an-html5-video-and-close-socket-or-connection
            plyr.media.setAttribute('src', 'https://cdn.selz.com/plyr/blank.mp4');

            // Load the new empty source
            // This will cancel existing requests
            // See https://github.com/Selz/plyr/issues/174
            plyr.media.load();

            // Debugging
            _log('Cancelled network requests');
        }

        function _formatTime(time) {
            if (isNaN(time) || time < 0) {
                time = 0;
            }

            var seconds = (time % 60) | 0;
            var minutes = ((time / 60) % 60) | 0;
            var hours = (((time / 60) / 60) % 60) | 0;
            var showHours = hours > 0;

            var hrStr = hours < 10 ? "0" + hours : "" + hours;
            var minStr = minutes < 10 ? "0" + minutes : "" + minutes;
            var secStr = seconds < 10 ? "0" + seconds : "" + seconds;

            if (hours > 0) {
                return hrStr + ":" + minStr + ":" + secStr;
            } else {
                return minStr + ":" + secStr;
            }
        }

        function _updateAdOverlay() {

            var currentTime = plyr.media.currentTime;
	        var adProgress = currentTime - plyr.adBreak.startTime;
            if(adProgress < 0) {
                adProgress = 0;
            }

            var countdown = plyr.adBreak.duration - adProgress;
            if(countdown < 0) {
                countdown = 0;
            }

            plyr.adDuration.innerHTML = _formatTime(countdown);
        }

        function _setAdaptivePlayer(adaptivePlayer) {

            //jbowers - uplynk - Use the logic in plyr to determine the browser and set that in the adaptiveplayer
            //so we can use it there without needing to duplicate the logic.
            adaptivePlayer.setBrowser(plyr.browser.isSafari, plyr.browser.isIE, plyr.browser.isChrome, plyr.browser.isFirefox);
            plyr.adaptivePlayer = adaptivePlayer;

            var updatedControls = false;
            adaptivePlayer.on(AdaptivePlayer.Event.Ready, function() {
                if(!updatedControls) {
                    updatedControls = true;
                    var duration = adaptivePlayer.duration;

                    if(adaptivePlayer.playlistType === "LIVE") {
                        duration = Infinity;
                    }

                    config.duration = duration;
                    _updateControls();
                    _setupAudioTracks();
                }
            });
            // UP-5529 NativePlayer's audio tracks may not be available for the Ready event above
            adaptivePlayer.on(AdaptivePlayer.Event.AudioTrackAdded, function() {
                _setupAudioTracks();
            });

            if(config.showThumbnails) {
                _on(plyr.container, "thumbnail", function(ev) {
                    var img = ev.detail.img;
                    var time = ev.detail.time;

                    if(img && plyr.adaptivePlayer.supportsThumbnails) {
                        var thumb = adaptivePlayer.getThumbnail(time, "small");
                        if(thumb) {
                            img.src = thumb.url;
                            img.width = thumb.width;
                            img.height = thumb.height;
                        }
                    }
                });
            }

            if(config.showAdBreakMarkers) {
                adaptivePlayer.on(AdaptivePlayer.Event.LoadedAdBreaks, function(ev) {

                    if (_inArray(config.controls, 'progress')) {

                        var container = document.createDocumentFragment();
                        var adBreaks = ev.adBreaks;

                        for(var i = 0; i < adBreaks.length; i++) {
                            var adBreak = adBreaks[i];
                            var marker = document.createElement("div");

                            var left = (adBreak.startTime / adaptivePlayer.duration) * 100;
                            var width = (adBreak.duration / adaptivePlayer.duration) * 100;

                            //
                            //TODO: put these styles in .css
                            //
                            marker.setAttribute("style", "left: " + left + "%; width: " + width + "%; background-color: #FFFFFF; top:8px;height:4px;position:absolute;border-radius:4px");
                            container.appendChild(marker);
                        }

                        var root = _getElement(config.selectors.progress.container);
                        if (root) {
                            root.appendChild(container);
                        }
                    }
                });
            }

            if(config.disableSeekDuringAdBreak) {
                adaptivePlayer.on(AdaptivePlayer.Event.AdBreakEntered, function(ev) {
                    plyr.inAd = true;
                    plyr.adBreak = ev.adBreak;
                    _toggleAdOverlay();
                    _updateAdOverlay();
                });

                adaptivePlayer.on(AdaptivePlayer.Event.AdBreakExited, function(ev) {
                    plyr.inAd = false;
                    plyr.adBreak = null;
                    _toggleAdOverlay();
                });

                adaptivePlayer.on(AdaptivePlayer.Event.AssetEntered, function(ev) {
                    var asset = ev.asset;
                    if (asset && asset.isAd) {
                        _adEntered(asset);
                    }
                });

                adaptivePlayer.on(AdaptivePlayer.Event.AssetExited, function(ev) {
                    var asset = ev.asset;
                    if (asset && asset.isAd) {
                        _adExited(asset);
                    }
                });
            }

            adaptivePlayer.on(AdaptivePlayer.Event.AudioTrackSwitched, function(ev) {
                var audioTrack = adaptivePlayer.audioTrack;
                if (audioTrack) {
                    _updateSelectedAudioTrack(audioTrack.label);
                }
            });
        }

        // Destroy an instance
        // Event listeners are removed when elements are removed
        // http://stackoverflow.com/questions/12528049/if-a-dom-element-is-removed-are-its-listeners-also-removed-from-memory
        function _destroy(callback, restore) {
            // Bail if the element is not initialized
            if (!plyr.init) {
                return null;
            }

            // Type specific stuff
            switch (plyr.type) {
                case 'youtube':
                    // Clear timers
                    window.clearInterval(timers.buffering);
                    window.clearInterval(timers.playing);

                    // Destroy YouTube API
                    plyr.embed.destroy();

                    // Clean up
                    cleanUp();

                    break;

                case 'vimeo':
                    // Destroy Vimeo API
                    // then clean up (wait, to prevent postmessage errors)
                    plyr.embed.unload().then(cleanUp);

                    // Vimeo does not always return
                    window.setTimeout(cleanUp, 200);

                    break;

                case 'video':
                case 'audio':
                    // Restore native video controls
                    _toggleNativeControls(true);

                    // Clean up
                    cleanUp();

                    break;
            }

            function cleanUp() {
                // Default to restore original element
                if (!_is.boolean(restore)) {
                    restore = true;
                }

                // Callback
                if (_is.function(callback)) {
                    callback.call(original);
                }

                // Bail if we don't need to restore the original element
                if (!restore) {
                    return;
                }

                // Remove init flag
                plyr.init = false;

                // Replace the container with the original element provided
                plyr.container.parentNode.replaceChild(original, plyr.container);

                // Event
                _triggerEvent(original, 'destroyed', true);
            }
        }

        // Setup a player
        function _init() {
            // Bail if the element is initialized
            if (plyr.init) {
                return null;
            }

            // Sniff out the browser
            plyr.browser = _getBrowser();

            // Bail if nothing to setup
            if (!_is.htmlElement(plyr.media)) {
                return;
            }

            // Load saved settings from localStorage
            _setupStorage();

            // Set media type based on tag or data attribute
            // Supported: video, audio, vimeo, youtube
            var tagName = media.tagName.toLowerCase();
            if (tagName === 'div') {
                plyr.type     = media.getAttribute('data-type');
                plyr.embedId  = media.getAttribute('data-video-id');

                // Clean up
                media.removeAttribute('data-type');
                media.removeAttribute('data-video-id');
            } else {
                plyr.type           = tagName;
                config.crossorigin  = (media.getAttribute('crossorigin') !== null);
                config.autoplay     = (config.autoplay || (media.getAttribute('autoplay') !== null));
                config.loop         = (config.loop || (media.getAttribute('loop') !== null));
            }

            // Check for support
            plyr.supported = supported(plyr.type);

            // If no native support, bail
            if (!plyr.supported.basic) {
                return;
            }

            // Wrap media
            plyr.container = _wrap(media, document.createElement('div'));

            // Allow focus to be captured
            plyr.container.setAttribute('tabindex', 0);

            // Add style hook
            _toggleStyleHook();

            // Debug info
            _log('' + plyr.browser.name + ' ' + plyr.browser.version);

            // Setup media
            _setupMedia();

            _initCaptionStyleDefaults();

            // Setup interface
            // If embed but not fully supported, setupInterface (to avoid flash of controls) and call ready now
            if (_inArray(config.types.html5, plyr.type) || (_inArray(config.types.embed, plyr.type) && !plyr.supported.full)) {
                // Setup UI
                _setupInterface();

                // Call ready
                _ready();

                // Set title on button and frame
                _setTitle();
            }

            // Successful setup
            plyr.init = true;
        }

        // Setup the UI
        function _setupInterface() {
            // Don't setup interface if no support
            if (!plyr.supported.full) {
                _warn('Basic support only', plyr.type);

                // Remove controls
                _remove(_getElement(config.selectors.controls.wrapper));

                // Remove large play
                _remove(_getElement(config.selectors.buttons.play));

                // Restore native controls
                _toggleNativeControls(true);

                // Bail
                return;
            }
            // Inject custom controls if not present
            var controlsMissing = !_getElements(config.selectors.controls.wrapper).length;
            if (controlsMissing) {
                // Inject custom controls
                _injectControls();
            }

            // Find the elements
            if (!_findElements()) {
                return;
            }

            // If the controls are injected, re-bind listeners for controls
            if (controlsMissing) {
                _controlListeners();
            }

            // Media element listeners
            _mediaListeners();

            // Remove native controls
            _toggleNativeControls();

            // Setup fullscreen
            _setupFullscreen();

            // Captions
            _setupCaptions();

            // Set volume
            _setVolume();
            _updateVolume();

            // Set playback speed
            _setSpeed();

            // Reset time display
            _timeUpdate();

            // Update the UI
            _checkPlaying();
        }

        api = {
            getOriginal:        function() { return original; },
            getContainer:       function() { return plyr.container },
            getEmbed:           function() { return plyr.embed; },
            getMedia:           function() { return plyr.media; },
            getType:            function() { return plyr.type; },
            getDuration:        _getDuration,
            getCurrentTime:     function() { return plyr.media.currentTime; },
            getVolume:          function() { return plyr.media.volume; },
            isMuted:            function() { return plyr.media.muted; },
            isReady:            function() { return _hasClass(plyr.container, config.classes.ready); },
            isLoading:          function() { return _hasClass(plyr.container, config.classes.loading); },
            isPaused:           function() { return plyr.media.paused; },
            on:                 function(event, callback) { _on(plyr.container, event, callback); return this; },
            play:               _play,
            pause:              _pause,
            stop:               function() { _pause(); _seek(); },
            restart:            _seek,
            rewind:             _rewind,
            forward:            _forward,
            seek:               _seek,
            source:             _source,
            poster:             _updatePoster,
            setVolume:          _setVolume,
            setSpeed:           _setSpeed,
            togglePlay:         _togglePlay,
            toggleMute:         _toggleMute,
            toggleCaptions:     _toggleCaptions,
            toggleFullscreen:   _toggleFullscreen,
            toggleControls:     _toggleControls,
            setCaptionIndex:    _setCaptionIndex,
            isFullscreen:       function() { return plyr.isFullscreen || false; },
            support:            function(mimeType) { return _support.mime(plyr, mimeType); },
            destroy:            _destroy,
            setAdaptivePlayer:  _setAdaptivePlayer,
        };

        // Everything done
        function _ready() {
            // Ready event at end of execution stack
            window.setTimeout(function() {
                _triggerEvent(plyr.media, 'ready');
            }, 0);

            // Set class hook on media element
            _toggleClass(plyr.media, defaults.classes.setup, true);

            // Set container class for ready
            _toggleClass(plyr.container, config.classes.ready, true);

            // Store a refernce to instance
            plyr.media.plyr = api;

            // Autoplay
            if (config.autoplay) {
                _play();
            }
        }

        // Initialize instance
        _init();

        // If init failed, return null
        if (!plyr.init) {
            return null;
        }

        return api;
    }

    // Load a sprite
    function loadSprite(url, id) {
        var x = new XMLHttpRequest();

        // If the id is set and sprite exists, bail
        if (_is.string(id) && _is.htmlElement(document.querySelector('#' + id))) {
            return;
        }

        // Create placeholder (to prevent loading twice)
        var container = document.createElement('div');
        container.setAttribute('hidden', '');
        if (_is.string(id)) {
            container.setAttribute('id', id);
        }
        document.body.insertBefore(container, document.body.childNodes[0]);

        // Check for CORS support
        if ('withCredentials' in x) {
            x.open('GET', url, true);
        } else {
            return;
        }

        // Inject hidden div with sprite on load
        x.onload = function() {
            container.innerHTML = x.responseText;
        }

        x.send();
    }

    // Check for support
    function supported(type) {
        var browser     = _getBrowser(),
            isOldIE     = (browser.isIE && browser.version <= 9),
            isIos       = browser.isIos,
            isOldSafari = (browser.isSafari && browser.version < 10),
            isIphone    = /iPhone|iPod/i.test(navigator.userAgent),
            audio       = !!document.createElement('audio').canPlayType,
            video       = !!document.createElement('video').canPlayType,
            basic, full;

        switch (type) {
            case 'video':
                basic = video;
                full  = (basic && (!isOldIE && !isIphone && !isOldSafari));
                break;

            case 'audio':
                basic = audio;
                full  = (basic && !isOldIE);
                break;

            case 'vimeo':
            case 'youtube':
            case 'soundcloud':
                basic = true;
                full  = (!isOldIE && !isIos && !isOldSafari);
                break;

            default:
                basic = (audio && video);
                full  = (basic && !isOldIE);
        }

        return {
            basic:  basic,
            full:   full
        };
    }

    // Setup function
    function setup(targets, options) {
        // Get the players
        var players     = [],
            instances   = [],
            selector    = [defaults.selectors.html5, defaults.selectors.embed].join(',');

        // Select the elements
        if (_is.string(targets)) {
            // String selector passed
            targets = document.querySelectorAll(targets);
        }  else if (_is.htmlElement(targets)) {
            // Single HTMLElement passed
            targets = [targets];
        }  else if (!_is.nodeList(targets) && !_is.array(targets) && !_is.string(targets))  {
            // No selector passed, possibly options as first argument
            // If options are the first argument
            if (_is.undefined(options) && _is.object(targets)) {
                options = targets;
            }

            // Use default selector
            targets = document.querySelectorAll(selector);
        }

        // Convert NodeList to array
        if (_is.nodeList(targets)) {
            targets = Array.prototype.slice.call(targets);
        }

        // Bail if disabled or no basic support
        // You may want to disable certain UAs etc
        if (!supported().basic || !targets.length) {
            return false;
        }

        // Add to container list
        function add(target, media) {
            if (!_hasClass(media, defaults.classes.hook)) {
                players.push({
                    // Always wrap in a <div> for styling
                    //container:  _wrap(media, document.createElement('div')),
                    // Could be a container or the media itself
                    target:     target,
                    // This should be the <video>, <audio> or <div> (YouTube/Vimeo)
                    media:      media
                });
            }
        }

        // Check if the targets have multiple media elements
        for (var i = 0; i < targets.length; i++) {
            var target = targets[i];

            // Get children
            var children = target.querySelectorAll(selector);

            // If there's more than one media element child, wrap them
            if (children.length) {
                for (var x = 0; x < children.length; x++) {
                    add(target, children[x]);
                }
            } else if (_matches(target, selector)) {
                // Target is media element
                add(target, target);
            }
        }

        // Create a player instance for each element
        players.forEach(function(player) {
            var element     = player.target,
                media       = player.media,
                match       = false;

            // The target element can also be the media element
            if (media === element) {
                match = true;
            }

            // Setup a player instance and add to the element
            // Create instance-specific config
            var data = {};

            // Try parsing data attribute config
            try { data = JSON.parse(element.getAttribute('data-plyr')); }
            catch(e) { }

            var config = _extend({}, defaults, options, data);

            // Bail if not enabled
            if (!config.enabled) {
                return null;
            }

            // Create new instance
            var instance = new Plyr(media, config);

            // Go to next if setup failed
            if (!_is.object(instance)) {
                return;
            }

            // Listen for events if debugging
            if (config.debug) {
                var events = config.events.concat(['setup', 'statechange', 'enterfullscreen', 'exitfullscreen', 'captionsenabled', 'captionsdisabled']);

                //don't log timeupdate events
                var index = events.indexOf('timeupdate');
                if(index > -1) {
                    events.splice(index, 1);
                }

                _on(instance.getContainer(), events.join(' '), function(event) {
                    console.log([config.logPrefix, 'event:', event.type].join(' '), event.detail.plyr);
                });
            }

            // Callback
            _event(instance.getContainer(), 'setup', true, {
                plyr: instance
            });

            // Add to return array even if it's already setup
            instances.push(instance);
        });

        return instances;
    }

    // Get all instances within a provided container
    function get(container) {
        if (_is.string(container)) {
            // Get selector if string passed
            container = document.querySelector(container);
        } else if (_is.undefined(container)) {
            // Use body by default to get all on page
            container = document.body;
        }

        // If we have a HTML element
        if (_is.htmlElement(container)) {
            var elements = container.querySelectorAll('.' + defaults.classes.setup),
                instances = [];

            Array.prototype.slice.call(elements).forEach(function(element) {
                if (_is.object(element.plyr)) {
                    instances.push(element.plyr);
                }
            });

            return instances;
        }

        return [];
    }

    return {
        setup:      setup,
        supported:  supported,
        loadSprite: loadSprite,
        get:        get
    };
}));

// Custom event polyfill
// https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent/CustomEvent
(function () {
    if (typeof window.CustomEvent === 'function') {
        return;
    }

    function CustomEvent(event, params) {
        params = params || { bubbles: false, cancelable: false, detail: undefined };
        var evt = document.createEvent('CustomEvent');
        evt.initCustomEvent(event, params.bubbles, params.cancelable, params.detail);
        return evt;
    }

    CustomEvent.prototype = window.Event.prototype;

    window.CustomEvent = CustomEvent;
})();