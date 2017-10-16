(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var AdBreak = (function () {
    function AdBreak(segments) {
        if (segments && segments.length > 0) {
            this._segments = segments;
            this.numAds = segments.length;
            this.startTime = segments[0].startTime;
            this.endTime = segments[segments.length - 1].endTime;
            this.duration = this.endTime - this.startTime;
        }
    }
    AdBreak.prototype.getAdPositionAt = function (time) {
        for (var i = 0; i < this._segments.length; i++) {
            if (this._segments[i].startTime <= time && time <= this._segments[i].endTime) {
                return i + 1;
            }
        }
        return 0;
    };
    AdBreak.prototype.getSegmentAt = function (index) {
        if (this._segments && index > -1 && index < this._segments.length) {
            return this._segments[index];
        }
        return undefined;
    };
    AdBreak.prototype.contains = function (time) {
        return this.startTime <= time && time <= this.endTime;
    };
    return AdBreak;
}());
exports.AdBreak = AdBreak;

},{}],2:[function(require,module,exports){
"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
var observable_1 = require("./utils/observable");
var asset_info_service_1 = require("./web-services/asset-info-service");
var ping_service_1 = require("./web-services/ping-service");
var id3_handler_1 = require("./id3/id3-handler");
var segment_map_1 = require("./utils/segment-map");
var thumb = require("./utils/thumbnail-helper");
var events_1 = require("./events");
var utils_1 = require("./utils/utils");
var license_manager_1 = require("./license-manager");
var utils_2 = require("./utils/utils");
var AdaptivePlayer = (function (_super) {
    __extends(AdaptivePlayer, _super);
    function AdaptivePlayer(video, options) {
        var _this = _super.call(this) || this;
        _this._defaults = {
            disableSeekDuringAdBreak: true,
            showPoster: false,
            debug: false,
            limitResolutionToViewSize: false,
        };
        var data = {};
        try {
            data = JSON.parse(video.getAttribute('data-config'));
        }
        catch (e) { }
        _this._config = Object.assign({}, _this._defaults, options, data);
        _this._video = video;
        _this._id3Handler = new id3_handler_1.ID3Handler(video);
        _this._id3Handler.on(id3_handler_1.ID3Handler.Event.ID3Tag, _this._onID3Tag.bind(_this));
        _this._id3Handler.on(id3_handler_1.ID3Handler.Event.TxxxID3Frame, _this._onTxxxID3Frame.bind(_this));
        _this._id3Handler.on(id3_handler_1.ID3Handler.Event.PrivID3Frame, _this._onPrivID3Frame.bind(_this));
        _this._id3Handler.on(id3_handler_1.ID3Handler.Event.TextID3Frame, _this._onTextID3Frame.bind(_this));
        _this._id3Handler.on(id3_handler_1.ID3Handler.Event.SliceEntered, _this._onSliceEntered.bind(_this));
        _this._onVideoTimeUpdate = _this._onVideoTimeUpdate.bind(_this);
        _this._onVideoSeeking = _this._onVideoSeeking.bind(_this);
        _this._onVideoSeeked = _this._onVideoSeeked.bind(_this);
        _this._onMediaSourceOpen = _this._onMediaSourceOpen.bind(_this);
        _this._onVideoPlaybackEnd = _this._onVideoPlaybackEnd.bind(_this);
        _this._onTimerTick = _this._onTimerTick.bind(_this);
        _this._isSafari = false;
        _this._isIE = false;
        _this._isFirefox = false;
        _this._isChrome = false;
        _this._firedReadyEvent = false;
        _this._ended = false;
        _this._usingCustomUI = false;
        _this._intervalId = 0;
        _this._overrideCurrentTime();
        _this._overrideEnded();
        return _this;
    }
    AdaptivePlayer.prototype._overrideCurrentTime = function () {
        var currentTimeProperty = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');
        if (currentTimeProperty) {
            var getCurrentTime = currentTimeProperty.get;
            var setCurrentTime = currentTimeProperty.set;
            var self_1 = this;
            Object.defineProperty(this._video, 'currentTime', {
                get: function () {
                    return getCurrentTime.apply(this);
                },
                set: function (val) {
                    if (self_1.canSeek()) {
                        self_1._ended = false;
                        val = parseFloat(val);
                        var actualTime = self_1.getSeekTime(val);
                        setCurrentTime.apply(this, [actualTime]);
                        self_1._adaptiveSource.seek(actualTime);
                    }
                },
                enumerable: false,
                configurable: false,
            });
        }
    };
    AdaptivePlayer.prototype._overrideEnded = function () {
        var self = this;
        Object.defineProperty(this._video, 'ended', {
            get: function () {
                return self._ended;
            },
            enumerable: false,
            configurable: false,
        });
    };
    Object.defineProperty(AdaptivePlayer, "Event", {
        get: function () {
            return events_1.Events;
        },
        enumerable: true,
        configurable: true
    });
    AdaptivePlayer.prototype.destroy = function () {
        this._stopMainLoop();
        if (typeof this._adaptiveSource != 'undefined') {
            this._adaptiveSource.delete();
            this._adaptiveSource = undefined;
        }
        if (this._objectUrl) {
            window.URL.revokeObjectURL(this._objectUrl);
            this._objectUrl = null;
        }
    };
    AdaptivePlayer.prototype.load = function (url) {
        this._protocol = utils_2.getProtocol(url);
        if (utils_2.isIE11OrEdge() && this._protocol === 'http:' && this._isUplynkUrl(url)) {
            this._protocol = 'https:';
            url = 'https:' + url.substr(5);
        }
        this._firedReadyEvent = false;
        this._url = url;
        this._targetTime = undefined;
        this._forcedAdBreak = undefined;
        this._ended = false;
        this._mediaSource = new MediaSource();
        if (typeof this._adaptiveSource != 'undefined') {
            this._adaptiveSource.delete();
            this._adaptiveSource = undefined;
        }
        this._video.removeEventListener('timeupdate', this._onVideoTimeUpdate);
        this._video.removeEventListener('seeking', this._onVideoSeeking);
        this._video.removeEventListener('seeked', this._onVideoSeeked);
        this._video.removeEventListener('ended', this._onVideoPlaybackEnd);
        this._video.addEventListener('timeupdate', this._onVideoTimeUpdate);
        this._video.addEventListener('seeking', this._onVideoSeeking);
        this._video.addEventListener('seeked', this._onVideoSeeked);
        this._video.addEventListener('ended', this._onVideoPlaybackEnd);
        this._video.onloadedmetadata = this.updateVideoRect.bind(this);
        this._mediaSource.addEventListener('sourceopen', this._onMediaSourceOpen);
        this._adaptiveSource = new Module.AdaptiveSource();
        this._adaptiveSource.onBeamLoaded(this._onBeamLoaded.bind(this));
        this._adaptiveSource.onTrackLoaded(this._onTrackLoaded.bind(this));
        this._adaptiveSource.onLoaded(this._onSourceLoaded.bind(this));
        this._adaptiveSource.onLoadError(this._onLoadError.bind(this));
        this._adaptiveSource.onDrmError(this._onDrmError.bind(this));
        this._adaptiveSource.onSegmentMapChanged(this._onSegmentMapChanged.bind(this));
        this._adaptiveSource.startMainLoop(this._startMainLoop.bind(this));
        this._adaptiveSource.stopMainLoop(this._stopMainLoop.bind(this));
        this._adaptiveSource.startLicenseRequest(this._startLicenseRequest.bind(this));
        this._adaptiveSource.onAudioTrackSwitched(this._onAudioTrackSwitched.bind(this));
        if (utils_1.isLocalStorageAvailable()) {
            this._adaptiveSource.setLoadAndSaveBandwidth(this._loadBandwidthHistory.bind(this), this._saveBandwidthHistory.bind(this));
        }
        if (this._objectUrl) {
            window.URL.revokeObjectURL(this._objectUrl);
            this._objectUrl = null;
        }
        this._objectUrl = window.URL.createObjectURL(this._mediaSource);
        this._video.src = this._objectUrl;
        this._video.load();
    };
    AdaptivePlayer.prototype.canSeek = function () {
        if (this._adaptiveSource === undefined) {
            return false;
        }
        if (this.playlistType === 'LIVE' || this.playlistType === 'EVENT') {
            return true;
        }
        if (!this._usingCustomUI) {
            return true;
        }
        if (!this._config.disableSeekDuringAdBreak) {
            return true;
        }
        if (this._segmentMap === undefined) {
            return false;
        }
        return !this._segmentMap.inAdBreak(this._video.currentTime);
    };
    AdaptivePlayer.prototype.getSeekTime = function (targetTime) {
        if (this.playlistType === 'LIVE' || this.playlistType === 'EVENT') {
            return targetTime;
        }
        if (!this._config.disableSeekDuringAdBreak) {
            return targetTime;
        }
        if (!this._usingCustomUI) {
            return targetTime;
        }
        var currentTime = this._video.currentTime;
        var adBreak = this._segmentMap.getAdBreak(targetTime);
        if (adBreak) {
            return adBreak.startTime;
        }
        var adBreaks = this._segmentMap.getAdBreaksBetween(currentTime, targetTime);
        if (adBreaks && adBreaks.length > 0) {
            this._targetTime = targetTime;
            this._forcedAdBreak = adBreaks[adBreaks.length - 1];
            return this._forcedAdBreak.startTime;
        }
        return targetTime;
    };
    AdaptivePlayer.prototype.setBrowser = function (safari, ie, chrome, firefox) {
        this._isSafari = safari;
        this._isIE = ie;
        this._isFirefox = firefox;
        this._isChrome = chrome;
        this._usingCustomUI = true;
    };
    AdaptivePlayer.prototype._onVideoTimeUpdate = function () {
        if (this._adaptiveSource && this._video) {
            if (this._forcedAdBreak && this._video.currentTime > this._forcedAdBreak.endTime) {
                var targetTime = this._targetTime;
                this._targetTime = undefined;
                this._forcedAdBreak = undefined;
                this._video.currentTime = targetTime;
            }
            if (this._adaptiveSource && this._video && !this._video.seeking) {
                this._adaptiveSource.onTimeUpdate();
            }
            if (this.playlistType === 'VOD' && !this._ended && this._video.duration - this._video.currentTime <= 0.25) {
                this._ended = true;
                var event = new CustomEvent('ended');
                this._video.dispatchEvent(event);
                this._video.pause();
            }
            this.updateVideoRect();
        }
    };
    AdaptivePlayer.prototype._onVideoSeeking = function () {
        if (this._isSafari && !(this.playlistType == "EVENT" || this.playlistType == "LIVE")) {
            this._isPaused = this._video.paused;
            this._video.pause();
        }
    };
    AdaptivePlayer.prototype._onVideoSeeked = function () {
        if (this._isSafari && !this._isPaused && !(this.playlistType == "EVENT" || this.playlistType == "LIVE")) {
            this._video.play();
        }
    };
    AdaptivePlayer.prototype._onVideoPlaybackEnd = function () {
        this._adaptiveSource.videoPlaybackEnd();
    };
    AdaptivePlayer.prototype._onMediaSourceOpen = function () {
        this._adaptiveSource.initializeVideoElement(this._video, this._mediaSource, this._config.debug);
        this._adaptiveSource.load(this._url);
    };
    AdaptivePlayer.prototype._onID3Tag = function (event) {
        _super.prototype.fire.call(this, events_1.Events.ID3Tag, event);
    };
    AdaptivePlayer.prototype._onTxxxID3Frame = function (event) {
        _super.prototype.fire.call(this, events_1.Events.TxxxID3Frame, event);
    };
    AdaptivePlayer.prototype._onPrivID3Frame = function (event) {
        _super.prototype.fire.call(this, events_1.Events.PrivID3Frame, event);
    };
    AdaptivePlayer.prototype._onTextID3Frame = function (event) {
        _super.prototype.fire.call(this, events_1.Events.TextID3Frame, event);
    };
    AdaptivePlayer.prototype._onSliceEntered = function (event) {
        _super.prototype.fire.call(this, events_1.Events.SliceEntered, event);
    };
    AdaptivePlayer.prototype._onBeamLoaded = function () {
        var _this = this;
        this._assetInfoService = new asset_info_service_1.AssetInfoService(this._protocol, this._adaptiveSource.domain, this._adaptiveSource.sessionId);
        this._pingService = new ping_service_1.PingService(this._protocol, this._adaptiveSource.domain, this._adaptiveSource.sessionId, this._video);
        this._video.textTracks.addEventListener('change', function (changeTrackEvent) {
            _this.onTextTrackChanged(changeTrackEvent);
        });
        _super.prototype.fire.call(this, events_1.Events.BeamLoaded);
    };
    AdaptivePlayer.prototype._onTrackLoaded = function () {
        _super.prototype.fire.call(this, events_1.Events.TrackLoaded);
        if (!this._firedReadyEvent) {
            this._firedReadyEvent = true;
            _super.prototype.fire.call(this, events_1.Events.Ready);
        }
    };
    AdaptivePlayer.prototype._startMainLoop = function () {
        if (this._intervalId === 0) {
            this._intervalId = setInterval(this._onTimerTick, 15);
        }
    };
    AdaptivePlayer.prototype._stopMainLoop = function () {
        if (this._intervalId !== 0) {
            clearInterval(this._intervalId);
            this._intervalId = 0;
        }
    };
    AdaptivePlayer.prototype._onTimerTick = function () {
        this._adaptiveSource.onTick();
    };
    AdaptivePlayer.prototype._isUplynkUrl = function (url) {
        var temp = url.toLowerCase();
        return temp.indexOf('uplynk.com') > -1 || temp.indexOf('downlynk.com') > -1;
    };
    AdaptivePlayer.prototype._onSourceLoaded = function () {
        var _this = this;
        if (!this._isUplynkUrl(this._url)) {
            this._adaptiveSource.start();
            _super.prototype.fire.call(this, events_1.Events.SourceLoaded);
        }
        else {
            this._assetInfoService.loadSegmentMap(this._segmentMap, function () {
                _this._adaptiveSource.start();
                _super.prototype.fire.call(_this, events_1.Events.SourceLoaded);
                if (_this._config.showPoster && _this.playlistType == "VOD") {
                    var contentSegment = _this._segmentMap.contentSegments[0];
                    var contentAsset = _this._assetInfoService.getAssetInfo(contentSegment.id);
                    _this._video.poster = contentAsset.posterUrl;
                }
            });
        }
    };
    AdaptivePlayer.prototype._onLoadError = function (message, code) {
        _super.prototype.fire.call(this, events_1.Events.LoadError, { error: message, code: code });
    };
    AdaptivePlayer.prototype._onDrmError = function (message) {
        _super.prototype.fire.call(this, events_1.Events.DrmError, { error: message });
    };
    AdaptivePlayer.prototype._onSegmentMapChanged = function () {
        if (this.playlistType === "VOD") {
            if (!this._segmentMap) {
                this._segmentMap = new segment_map_1.SegmentMap(this._adaptiveSource.segmentMap);
                this._initSegmentTextTrack();
                this._initAdBreakTextTrack();
                _super.prototype.fire.call(this, events_1.Events.SegmentMapLoaded, { segmentMap: this._segmentMap });
                _super.prototype.fire.call(this, events_1.Events.LoadedAdBreaks, { adBreaks: this._segmentMap.adBreaks });
            }
        }
        else {
            this._segmentMap = new segment_map_1.SegmentMap(this._adaptiveSource.segmentMap);
            _super.prototype.fire.call(this, events_1.Events.SegmentMapLoaded, { segmentMap: this._segmentMap });
        }
    };
    AdaptivePlayer.prototype._startLicenseRequest = function () {
        if (this._licenseManager === undefined) {
            this._licenseManager = new license_manager_1.LicenseManager(this._video);
        }
        this._licenseManager.setKeyServerPrefix(this._adaptiveSource.keyServerPrefix);
        this._licenseManager.addLicenseRequest(utils_2.base64ToBuffer(this._adaptiveSource.pssh));
    };
    AdaptivePlayer.prototype._loadBandwidthHistory = function () {
        var historyVersion = parseInt(localStorage.getItem("UplynkHistoryVersion"), 10) || 0;
        if (historyVersion < 2 && localStorage.getItem("UplynkHistory") != null) {
            console.log("[adaptive-player.ts] _loadBandwidthHistory found an older history version. Removing it");
            localStorage.removeItem("UplynkHistory");
            localStorage.removeItem("UplynkHistoryTimestamp");
            return null;
        }
        var timestampStr = localStorage.getItem("UplynkHistoryTimestamp");
        var timestamp = parseInt(timestampStr, 10) || 0;
        var now = Date.now();
        var MAX_AGE = 60 * 60 * 1000;
        if (now - timestamp < MAX_AGE) {
            var history_1 = localStorage.getItem("UplynkHistory");
            return JSON.parse(history_1);
        }
        return null;
    };
    AdaptivePlayer.prototype._saveBandwidthHistory = function (history) {
        if (history == null)
            return;
        var timestamp = Date.now();
        localStorage.setItem("UplynkHistoryVersion", "2");
        localStorage.setItem("UplynkHistoryTimestamp", timestamp.toString());
        localStorage.setItem("UplynkHistory", JSON.stringify(history));
    };
    AdaptivePlayer.prototype.getThumbnail = function (time, size) {
        if (size === void 0) { size = "small"; }
        return thumb.getThumbnail(time, this._segmentMap, this._assetInfoService, size);
    };
    AdaptivePlayer.prototype._initSegmentTextTrack = function () {
        var _this = this;
        if (typeof VTTCue === 'undefined') {
            return;
        }
        var segmentTextTrack = this._getOrCreateTextTrack("metadata", "segments");
        var _loop_1 = function (i) {
            var segment = this_1._segmentMap.getSegmentAt(i);
            var cue = new VTTCue(segment.startTime, segment.endTime, segment.id);
            if (cue !== undefined) {
                cue.addEventListener("enter", function () {
                    _this._assetInfoService.loadSegment(segment, function (assetInfo) {
                        _super.prototype.fire.call(_this, events_1.Events.AssetEntered, { segment: segment, asset: assetInfo });
                    });
                });
                cue.addEventListener("exit", function () {
                    _this._assetInfoService.loadSegment(segment, function (assetInfo) {
                        _super.prototype.fire.call(_this, events_1.Events.AssetExited, { segment: segment, asset: assetInfo });
                    });
                });
                segmentTextTrack.addCue(cue);
            }
        };
        var this_1 = this;
        for (var i = 0; i < this._segmentMap.length; i++) {
            _loop_1(i);
        }
    };
    AdaptivePlayer.prototype._initAdBreakTextTrack = function () {
        var _this = this;
        if (typeof VTTCue === 'undefined') {
            return;
        }
        var adBreaks = this._segmentMap.adBreaks;
        if (adBreaks.length === 0) {
            return;
        }
        var track = this._getOrCreateTextTrack("metadata", "adbreaks");
        var _loop_2 = function (i) {
            var adBreak = adBreaks[i];
            var cue = new VTTCue(adBreak.startTime, adBreak.endTime, "adbreak");
            if (cue !== undefined) {
                cue.addEventListener("enter", function () {
                    _super.prototype.fire.call(_this, events_1.Events.AdBreakEntered, { adBreak: adBreak });
                });
                cue.addEventListener("exit", function () {
                    _super.prototype.fire.call(_this, events_1.Events.AdBreakExited, { adBreak: adBreak });
                });
                track.addCue(cue);
            }
        };
        for (var i = 0; i < adBreaks.length; i++) {
            _loop_2(i);
        }
        if (this._isFirefox && !this._video.autoplay && adBreaks[0].startTime === 0 && this._video.currentTime === 0) {
            _super.prototype.fire.call(this, events_1.Events.AdBreakEntered, { adBreak: adBreaks[0] });
        }
    };
    AdaptivePlayer.prototype._getOrCreateTextTrack = function (kind, label) {
        for (var i = 0; i < this._video.textTracks.length; i++) {
            var track = this._video.textTracks[i];
            if (track.kind === kind && track.label === label) {
                return track;
            }
        }
        return this._video.addTextTrack(kind, label);
    };
    AdaptivePlayer.prototype.onTextTrackChanged = function (changeTrackEvent) {
        this._adaptiveSource.onTextTrackChanged(changeTrackEvent);
    };
    AdaptivePlayer.prototype.updateVideoRect = function () {
        var currentVideoRect = this._video.getBoundingClientRect();
        if ((!this._videoRect) || (this._videoRect.width != currentVideoRect.width || this._videoRect.height != currentVideoRect.height)) {
            this._videoRect = currentVideoRect;
            if (this._adaptiveSource && this._config.limitResolutionToViewSize) {
                this._adaptiveSource.setMaxVideoResolution(currentVideoRect.height, currentVideoRect.width);
            }
        }
    };
    AdaptivePlayer.prototype._onAudioTrackSwitched = function () {
        _super.prototype.fire.call(this, events_1.Events.AudioTrackSwitched);
    };
    Object.defineProperty(AdaptivePlayer.prototype, "audioTracks", {
        get: function () {
            return this._adaptiveSource.audioTracks;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(AdaptivePlayer.prototype, "audioTrack", {
        get: function () {
            var audioTracks = this.audioTracks;
            for (var i = 0; i < audioTracks.length; i++) {
                if (audioTracks[i].enabled) {
                    return audioTracks[i];
                }
            }
            return null;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(AdaptivePlayer.prototype, "audioTrackId", {
        get: function () {
            return this._adaptiveSource.audioTrackId;
        },
        set: function (id) {
            this._adaptiveSource.audioTrackId = id;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(AdaptivePlayer.prototype, "domain", {
        get: function () {
            return this._adaptiveSource.domain;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(AdaptivePlayer.prototype, "sessionId", {
        get: function () {
            return this._adaptiveSource.sessionId;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(AdaptivePlayer.prototype, "numberOfRays", {
        get: function () {
            return this._adaptiveSource.numberOfRays;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(AdaptivePlayer.prototype, "availableBandwidths", {
        get: function () {
            return this._adaptiveSource.availableBandwidths;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(AdaptivePlayer.prototype, "availableResolutions", {
        get: function () {
            return this._adaptiveSource.availableResolutions;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(AdaptivePlayer.prototype, "availableMimeTypes", {
        get: function () {
            return this._adaptiveSource.availableMimeTypes;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(AdaptivePlayer.prototype, "segmentMap", {
        get: function () {
            return this._segmentMap;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(AdaptivePlayer.prototype, "adBreaks", {
        get: function () {
            return this._segmentMap.adBreaks;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(AdaptivePlayer.prototype, "duration", {
        get: function () {
            return this._adaptiveSource ? this._adaptiveSource.duration : 0;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(AdaptivePlayer.prototype, "playlistType", {
        get: function () {
            return this._adaptiveSource.playlistType;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(AdaptivePlayer.prototype, "supportsThumbnails", {
        get: function () {
            return this.availableResolutions.length > 0;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(AdaptivePlayer.prototype, "className", {
        get: function () {
            return 'AdaptivePlayer';
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(AdaptivePlayer.prototype, "version", {
        get: function () {
            return '02.00.17101600';
        },
        enumerable: true,
        configurable: true
    });
    return AdaptivePlayer;
}(observable_1.Observable));
exports.AdaptivePlayer = AdaptivePlayer;

},{"./events":3,"./id3/id3-handler":5,"./license-manager":6,"./utils/observable":12,"./utils/segment-map":13,"./utils/thumbnail-helper":15,"./utils/utils":16,"./web-services/asset-info-service":17,"./web-services/ping-service":18}],3:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Events = {
    BeamLoaded: 'beamloaded',
    TrackLoaded: 'trackloaded',
    SourceLoaded: 'sourceloaded',
    LoadError: 'loaderror',
    DrmError: 'drmerror',
    SegmentMapLoaded: 'segmentmapLoaded',
    LoadedAdBreaks: 'loadedadbreaks',
    ID3Tag: 'id3Tag',
    TxxxID3Frame: 'txxxId3Frame',
    PrivID3Frame: 'privId3Frame',
    TextID3Frame: 'textId3Frame',
    SliceEntered: 'sliceEntered',
    AssetEntered: 'assetentered',
    AssetExited: 'assetexited',
    AdBreakEntered: 'adbreakentered',
    AdBreakExited: 'adbreakexited',
    Ready: 'ready',
    AudioTrackSwitched: 'audioTrackSwitched',
    AudioTrackAdded: 'audioTrackAdded',
};

},{}],4:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var utils_1 = require("../utils/utils");
var ID3Decoder = (function () {
    function ID3Decoder() {
    }
    ID3Decoder.getFrame = function (buffer) {
        if (buffer.length < 21) {
            return undefined;
        }
        if (buffer[0] === 73 &&
            buffer[1] === 68 &&
            buffer[2] === 51) {
            var frameType = String.fromCharCode(buffer[10], buffer[11], buffer[12], buffer[13]);
            var size = 0;
            size = (buffer[14] << 24);
            size |= (buffer[15] << 16);
            size |= (buffer[16] << 8);
            size |= buffer[17];
            var data = utils_1.slice(buffer, 20);
            return { type: frameType, size: size, data: data };
        }
        return undefined;
    };
    ID3Decoder.decodeTextFrame = function (id3Frame) {
        if (id3Frame.size < 2) {
            return undefined;
        }
        if (id3Frame.data[0] !== 3) {
            return undefined;
        }
        var data = utils_1.slice(id3Frame.data, 1);
        return { value: ID3Decoder.utf8ArrayToStr(data) };
    };
    ID3Decoder.decodeTxxxFrame = function (id3Frame) {
        if (id3Frame.size < 2) {
            return undefined;
        }
        if (id3Frame.data[0] !== 3) {
            return undefined;
        }
        var index = 1;
        var description = ID3Decoder.utf8ArrayToStr(utils_1.slice(id3Frame.data, index));
        index += description.length + 1;
        var value = ID3Decoder.utf8ArrayToStr(utils_1.slice(id3Frame.data, index));
        return { description: description, value: value };
    };
    ID3Decoder.decodePrivFrame = function (id3Frame) {
        if (id3Frame.size < 2) {
            return undefined;
        }
        var nullIndex = 0;
        for (var i = 0; i < id3Frame.data.length; i++) {
            if (id3Frame.data[i] === 0) {
                nullIndex = i;
                break;
            }
        }
        var owner = String.fromCharCode.apply(null, utils_1.slice(id3Frame.data, 0, nullIndex));
        var privateData = utils_1.slice(id3Frame.data, nullIndex + 1);
        return { owner: owner, data: privateData };
    };
    ID3Decoder.utf8ArrayToStr = function (array) {
        var char2;
        var char3;
        var out = "";
        var i = 0;
        var length = array.length;
        while (i < length) {
            var c = array[i++];
            switch (c >> 4) {
                case 0:
                    return out;
                case 1:
                case 2:
                case 3:
                case 4:
                case 5:
                case 6:
                case 7:
                    out += String.fromCharCode(c);
                    break;
                case 12:
                case 13:
                    char2 = array[i++];
                    out += String.fromCharCode(((c & 0x1F) << 6) | (char2 & 0x3F));
                    break;
                case 14:
                    char2 = array[i++];
                    char3 = array[i++];
                    out += String.fromCharCode(((c & 0x0F) << 12) |
                        ((char2 & 0x3F) << 6) |
                        ((char3 & 0x3F) << 0));
                    break;
            }
        }
        return out;
    };
    return ID3Decoder;
}());
exports.ID3Decoder = ID3Decoder;

},{"../utils/utils":16}],5:[function(require,module,exports){
"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
var observable_1 = require("../utils/observable");
var id3_decoder_1 = require("./id3-decoder");
var utils_1 = require("../utils/utils");
var ID3Handler = (function (_super) {
    __extends(ID3Handler, _super);
    function ID3Handler(video) {
        var _this = _super.call(this) || this;
        video.textTracks.addEventListener('addtrack', _this._onAddTrack.bind(_this));
        return _this;
    }
    ID3Handler.prototype._onAddTrack = function (addTrackEvent) {
        var track = addTrackEvent.track;
        if (this._isId3MetadataTrack(track)) {
            track.mode = 'hidden';
            track.addEventListener('cuechange', this._onID3CueChange.bind(this));
        }
    };
    ID3Handler.prototype._isId3MetadataTrack = function (track) {
        if (track.kind == "metadata" && track.label == "ID3") {
            return true;
        }
        if (track.kind == "metadata" && track.inBandMetadataTrackDispatchType) {
            var dispatchType = track.inBandMetadataTrackDispatchType;
            return dispatchType === "com.apple.streaming" || dispatchType === "15260DFFFF49443320FF49443320000F";
        }
        return false;
    };
    ID3Handler.prototype._onID3CueChange = function (cueChangeEvent) {
        var _this = this;
        var track = cueChangeEvent.target;
        for (var i = 0; i < track.activeCues.length; i++) {
            var cue = track.activeCues[i];
            if (!cue.onenter) {
                this._onID3Cue(cue);
            }
        }
        for (var i = 0; i < track.cues.length; i++) {
            var cue = track.cues[i];
            if (!cue.onenter) {
                cue.onenter = function (cueEvent) { _this._onID3Cue(cueEvent.target); };
            }
        }
    };
    ID3Handler.prototype._onID3Cue = function (cue) {
        var data = undefined;
        var id3Frame = undefined;
        var txxxFrame = undefined;
        var textFrame = undefined;
        var privFrame = undefined;
        if (cue.data) {
            data = new Uint8Array(cue.data);
        }
        else if (cue.value && cue.value.key && cue.value.data) {
            if (cue.value.key === 'TXXX') {
                var txxxCue = cue.value;
                txxxFrame = { value: txxxCue.data, description: undefined };
            }
            else if (cue.value.key === 'PRIV') {
                var privCue = cue.value;
                privFrame = { owner: privCue.info, data: new Uint8Array(privCue.data) };
            }
        }
        else {
            data = utils_1.base64ToBuffer(cue.text);
        }
        if (data) {
            id3Frame = id3_decoder_1.ID3Decoder.getFrame(data);
            if (id3Frame) {
                if (id3Frame.type === 'TXXX') {
                    txxxFrame = id3_decoder_1.ID3Decoder.decodeTxxxFrame(id3Frame);
                }
                else if (id3Frame.type === 'PRIV') {
                    privFrame = id3_decoder_1.ID3Decoder.decodePrivFrame(id3Frame);
                }
                else if (id3Frame.type[0] === 'T') {
                    textFrame = id3_decoder_1.ID3Decoder.decodeTextFrame(id3Frame);
                }
            }
        }
        if (id3Frame) {
            var event_1 = { cue: cue, frame: id3Frame };
            _super.prototype.fire.call(this, ID3Handler.Event.ID3Tag, event_1);
        }
        if (txxxFrame) {
            var txxxEvent = { cue: cue, frame: txxxFrame };
            _super.prototype.fire.call(this, ID3Handler.Event.TxxxID3Frame, txxxEvent);
            if (txxxFrame.value) {
                var sliceData = txxxFrame.value.split('_');
                if (sliceData.length == 3) {
                    var sliceEvent = { cue: cue, assetId: sliceData[0], rayChar: sliceData[1], sliceIndex: parseInt(sliceData[2], 16) };
                    _super.prototype.fire.call(this, ID3Handler.Event.SliceEntered, sliceEvent);
                }
            }
        }
        else if (privFrame) {
            var privEvent = { cue: cue, frame: privFrame };
            _super.prototype.fire.call(this, ID3Handler.Event.PrivID3Frame, privEvent);
        }
        else if (textFrame) {
            var textEvent = { cue: cue, frame: textFrame };
            _super.prototype.fire.call(this, ID3Handler.Event.TextID3Frame, textEvent);
        }
    };
    Object.defineProperty(ID3Handler, "Event", {
        get: function () {
            return {
                ID3Tag: 'id3Tag',
                TxxxID3Frame: 'txxxId3Frame',
                PrivID3Frame: 'privId3Frame',
                TextID3Frame: 'textId3Frame',
                SliceEntered: 'sliceEntered'
            };
        },
        enumerable: true,
        configurable: true
    });
    return ID3Handler;
}(observable_1.Observable));
exports.ID3Handler = ID3Handler;

},{"../utils/observable":12,"../utils/utils":16,"./id3-decoder":4}],6:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var LicenseManager = (function () {
    function LicenseManager(video) {
        this.LICENSE_TYPE_NONE = 0;
        this.LICENSE_TYPE_WIDEVINE = 1;
        this.LICENSE_TYPE_PLAYREADY = 2;
        this._licenseType = 0;
        this.playReadyKeySystem = {
            keySystem: 'com.microsoft.playready',
            supportedConfig: [
                {
                    initDataTypes: ['keyids', 'cenc'],
                    audioCapabilities: [
                        {
                            contentType: 'audio/mp4; codecs="mp4a"',
                            robustness: ''
                        }
                    ],
                    videoCapabilities: [
                        {
                            contentType: 'video/mp4; codecs="avc1"',
                            robustness: ''
                        }
                    ]
                }
            ]
        };
        this.widevineKeySystem = {
            keySystem: 'com.widevine.alpha',
            supportedConfig: [
                {
                    label: 'foo',
                    initDataTypes: ['cenc'],
                    sessionTypes: ['temporary'],
                    audioCapabilities: [
                        { contentType: 'audio/mp4; codecs="mp4a.40.5"', robustness: 'SW_SECURE_CRYPTO' }
                    ],
                    videoCapabilities: [
                        { contentType: 'video/mp4; codecs="avc1.4d001f"', robustness: 'HW_SECURE_ALL' },
                        { contentType: 'video/mp4; codecs="avc1.4d001f"', robustness: 'HW_SECURE_DECODE' },
                        { contentType: 'video/mp4; codecs="avc1.4d001f"', robustness: 'HW_SECURE_CRYPTO' },
                        { contentType: 'video/mp4; codecs="avc1.4d001f"', robustness: 'SW_SECURE_DECODE' },
                        { contentType: 'video/mp4; codecs="avc1.4d001f"', robustness: 'SW_SECURE_CRYPTO' },
                        { contentType: 'video/mp4; codecs="avc1.4d001e"', robustness: 'HW_SECURE_ALL' },
                        { contentType: 'video/mp4; codecs="avc1.4d001e"', robustness: 'SW_SECURE_CRYPTO' },
                        { contentType: 'video/mp4; codecs="avc1.4d0016"', robustness: 'HW_SECURE_ALL' },
                        { contentType: 'video/mp4; codecs="avc1.4d0016"', robustness: 'SW_SECURE_CRYPTO' },
                        { contentType: 'video/mp4; codecs="avc1.42000d"', robustness: 'HW_SECURE_ALL' },
                        { contentType: 'video/mp4; codecs="avc1.42000d"', robustness: 'SW_SECURE_CRYPTO' },
                        { contentType: 'video/mp4; codecs="avc1.42000c"', robustness: 'HW_SECURE_ALL' },
                        { contentType: 'video/mp4; codecs="avc1.42000c"', robustness: 'SW_SECURE_CRYPTO' },
                        { contentType: 'video/mp4; codecs="avc1.42000b"', robustness: 'HW_SECURE_ALL' },
                        { contentType: 'video/mp4; codecs="avc1.42000b"', robustness: 'SW_SECURE_CRYPTO' },
                    ]
                }
            ]
        };
        this._video = video;
        this._keyServerPrefix = null;
        this._pssh = null;
        this._mediaKeys = null;
        this._pendingKeyRequests = [];
        this.initMediaKeys();
    }
    LicenseManager.prototype.addLicenseRequest = function (psshData) {
        console.log("LicenseManager - Requesting license for DRM playback");
        this._pendingKeyRequests.push({ initDataType: 'cenc', initData: psshData });
        this.processPendingKeys(this);
    };
    LicenseManager.prototype.setKeyServerPrefix = function (keyServerPrefix) {
        this._keyServerPrefix = keyServerPrefix;
    };
    LicenseManager.prototype.initMediaKeys = function () {
        var self = this;
        this._mediaKeys = null;
        navigator.requestMediaKeySystemAccess(self.widevineKeySystem.keySystem, self.widevineKeySystem.supportedConfig)
            .then(function (keySystemAccess) {
            self._licenseType = self.LICENSE_TYPE_WIDEVINE;
            keySystemAccess.createMediaKeys()
                .then(function (createdMediaKeys) {
                self.onMediaKeyAcquired(self, createdMediaKeys);
            }, function (e) {
                console.log('LicenseManager - createMediaKeys() failed for WideVine');
            });
        }, function () { console.log('LicenseManager - Your browser/system does not support the requested configurations for playing WideVine protected content.'); });
    };
    LicenseManager.prototype.onMediaKeyAcquired = function (self, createdMediaKeys) {
        self._mediaKeys = createdMediaKeys;
        self._video.setMediaKeys(self._mediaKeys);
        self.processPendingKeys(self);
    };
    LicenseManager.prototype.processPendingKeys = function (self) {
        if (self._mediaKeys === null) {
            return;
        }
        while (self._pendingKeyRequests.length > 0) {
            var data = self._pendingKeyRequests.shift();
            self.getNewKeySession(data.initDataType, data.initData);
        }
    };
    LicenseManager.prototype.getNewKeySession = function (initDataType, initData) {
        var self = this;
        var keySession = self._mediaKeys.createSession("temporary");
        keySession.addEventListener('message', function (event) {
            self.downloadNewKey(self.getLicenseUrl(), event.message, function (data) {
                var prom = event.target.update(data);
                prom.catch(function (e) {
                    console.log('LicenseManager - call to MediaKeySession.update() failed' + e);
                });
                console.log("LicenseManager - finished license update for DRM playback");
            });
        }, false);
        var reqPromise = keySession.generateRequest(initDataType, initData);
        reqPromise.catch(function (e) {
            console.log('LicenseManager - keySession.generateRequest() failed: ' + e);
        });
    };
    LicenseManager.prototype.getLicenseUrl = function () {
        if (this._licenseType === this.LICENSE_TYPE_PLAYREADY) {
            return this._keyServerPrefix + "/pr";
        }
        else if (this._licenseType === this.LICENSE_TYPE_WIDEVINE) {
            return this._keyServerPrefix + "/wv";
        }
        return '';
    };
    LicenseManager.prototype.downloadNewKey = function (url, keyMessage, callback) {
        var challenge;
        var xhr = new XMLHttpRequest();
        xhr.open('POST', url, true);
        xhr.withCredentials = true;
        xhr.responseType = 'arraybuffer';
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    callback(xhr.response);
                }
                else {
                    throw 'LicenseManager - XHR failed (' + url + '). Status: ' + xhr.status + ' (' + xhr.statusText + ')';
                }
            }
        };
        if (this._licenseType === this.LICENSE_TYPE_PLAYREADY) {
        }
        else if (this._licenseType === this.LICENSE_TYPE_WIDEVINE) {
            challenge = keyMessage;
        }
        xhr.send(challenge);
    };
    return LicenseManager;
}());
exports.LicenseManager = LicenseManager;

},{}],7:[function(require,module,exports){
"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
var observable_1 = require("./utils/observable");
var events_1 = require("./events");
var ad_break_1 = require("./ad/ad-break");
var id3_handler_1 = require("./id3/id3-handler");
var asset_info_service_1 = require("./web-services/asset-info-service");
var ping_service_1 = require("./web-services/ping-service");
var utils_1 = require("./utils/utils");
var NativePlayer = (function (_super) {
    __extends(NativePlayer, _super);
    function NativePlayer(video, options) {
        var _this = _super.call(this) || this;
        _this._defaults = {
            disableSeekDuringAdBreak: true,
            showPoster: false,
            debug: false
        };
        var data = {};
        try {
            data = JSON.parse(video.getAttribute('data-config'));
        }
        catch (e) { }
        _this._config = Object.assign({}, _this._defaults, options, data);
        _this._video = video;
        _this._id3Handler = new id3_handler_1.ID3Handler(video);
        _this._id3Handler.on(id3_handler_1.ID3Handler.Event.ID3Tag, _this._onID3Tag.bind(_this));
        _this._id3Handler.on(id3_handler_1.ID3Handler.Event.TxxxID3Frame, _this._onTxxxID3Frame.bind(_this));
        _this._id3Handler.on(id3_handler_1.ID3Handler.Event.PrivID3Frame, _this._onPrivID3Frame.bind(_this));
        _this._id3Handler.on(id3_handler_1.ID3Handler.Event.TextID3Frame, _this._onTextID3Frame.bind(_this));
        _this._id3Handler.on(id3_handler_1.ID3Handler.Event.SliceEntered, _this._onSliceEntered.bind(_this));
        _this._onDurationChange = _this._onDurationChange.bind(_this);
        _this._overrideCurrentTime();
        return _this;
    }
    NativePlayer.prototype.load = function (url) {
        this._protocol = utils_1.getProtocol(url);
        this._firedReadyEvent = false;
        this._currentAssetId = null;
        this._video.removeEventListener('durationchange', this._onDurationChange);
        this._video.addEventListener('durationchange', this._onDurationChange);
        this._video.audioTracks.addEventListener('addtrack', this._onAudioTrackAdded.bind(this));
        this._sessionId = this._getSessionId(url);
        this._domain = this._getDomain(url);
        this._assetInfoService = new asset_info_service_1.AssetInfoService(this._protocol, this.domain);
        if (this._domain !== 'content.uplynk.com') {
            this._pingService = new ping_service_1.PingService(this._protocol, this.domain, this._sessionId, this._video);
        }
        this._url = url;
        this._video.src = url;
        this._video.load();
    };
    NativePlayer.prototype.destroy = function () {
        this._video.src = null;
    };
    NativePlayer.prototype._overrideCurrentTime = function () {
        var currentTimeDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');
        if (currentTimeDescriptor) {
            var getCurrentTime_1 = currentTimeDescriptor.get;
            var setCurrentTime_1 = currentTimeDescriptor.set;
            var self_1 = this;
            Object.defineProperty(this._video, 'currentTime', {
                get: function () {
                    return getCurrentTime_1.apply(this);
                },
                set: function (val) {
                    if (self_1.canSeek()) {
                        setCurrentTime_1.apply(this, [val]);
                    }
                },
                enumerable: false,
                configurable: false,
            });
        }
    };
    NativePlayer.prototype.canSeek = function () {
        if (!this._config.disableSeekDuringAdBreak) {
            return true;
        }
        return !this._inAdBreak;
    };
    NativePlayer.prototype._getSessionId = function (url) {
        var match = RegExp('[?&]pbs=([^&]*)').exec(url);
        return match && decodeURIComponent(match[1].replace(/\+/g, ' '));
    };
    NativePlayer.prototype._getDomain = function (url) {
        var link = document.createElement('a');
        link.setAttribute('href', url);
        return link.hostname;
    };
    NativePlayer.prototype._onDurationChange = function () {
        if (this._video.duration === Infinity) {
            this._playlistType = 'LIVE';
        }
        else {
            this._playlistType = 'VOD';
        }
        if (!this._firedReadyEvent) {
            this._firedReadyEvent = true;
            _super.prototype.fire.call(this, events_1.Events.Ready);
        }
    };
    Object.defineProperty(NativePlayer, "Event", {
        get: function () {
            return events_1.Events;
        },
        enumerable: true,
        configurable: true
    });
    NativePlayer.prototype.setBrowser = function (safari, ie, chrome, firefox) {
    };
    NativePlayer.prototype.getThumbnail = function (time, size) {
        return null;
    };
    Object.defineProperty(NativePlayer.prototype, "audioTracks", {
        get: function () {
            return this._video.audioTracks;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(NativePlayer.prototype, "audioTrackId", {
        get: function () {
            var currentTrack = this.audioTrack;
            if (currentTrack != null) {
                return parseInt(currentTrack.id);
            }
            return 0;
        },
        set: function (id) {
            var audioTracks = this.audioTracks;
            for (var i = 0; i < audioTracks.length; i++) {
                if (parseInt(audioTracks[i].id) === id) {
                    audioTracks[i].enabled = true;
                    return;
                }
            }
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(NativePlayer.prototype, "audioTrack", {
        get: function () {
            var audioTracks = this.audioTracks;
            for (var i = 0; i < audioTracks.length; i++) {
                if (audioTracks[i].enabled) {
                    return audioTracks[i];
                }
            }
            return null;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(NativePlayer.prototype, "domain", {
        get: function () {
            return this._domain;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(NativePlayer.prototype, "sessionId", {
        get: function () {
            return this._sessionId;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(NativePlayer.prototype, "playlistType", {
        get: function () {
            return this._playlistType;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(NativePlayer.prototype, "duration", {
        get: function () {
            return this._video.duration;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(NativePlayer.prototype, "supportsThumbnails", {
        get: function () {
            return false;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(NativePlayer.prototype, "className", {
        get: function () {
            return 'NativePlayer';
        },
        enumerable: true,
        configurable: true
    });
    NativePlayer.prototype._onID3Tag = function (event) {
        _super.prototype.fire.call(this, events_1.Events.ID3Tag, event);
    };
    NativePlayer.prototype._onTxxxID3Frame = function (event) {
        _super.prototype.fire.call(this, events_1.Events.TxxxID3Frame, event);
    };
    NativePlayer.prototype._onPrivID3Frame = function (event) {
        _super.prototype.fire.call(this, events_1.Events.PrivID3Frame, event);
    };
    NativePlayer.prototype._onTextID3Frame = function (event) {
        _super.prototype.fire.call(this, events_1.Events.TextID3Frame, event);
    };
    NativePlayer.prototype._onAudioTrackAdded = function (event) {
        _super.prototype.fire.call(this, events_1.Events.AudioTrackAdded, event);
    };
    NativePlayer.prototype._onSliceEntered = function (event) {
        var _this = this;
        _super.prototype.fire.call(this, events_1.Events.SliceEntered, event);
        if (this._currentAssetId === null) {
            this._assetInfoService.loadAssetId(event.assetId, null, function (assetInfo) {
                _this._currentAssetId = event.assetId;
                _this._onAssetEncountered(event.cue, assetInfo);
            });
        }
        else if (this._currentAssetId !== event.assetId) {
            this._assetInfoService.loadAssetId(this._currentAssetId, null, function (currentAssetInfo) {
                _this._assetInfoService.loadAssetId(event.assetId, null, function (newAssetInfo) {
                    _this._currentAssetId = event.assetId;
                    _this._onNewAssetEncountered(event.cue, currentAssetInfo, newAssetInfo);
                });
            });
        }
        else {
        }
    };
    NativePlayer.prototype._onAssetEncountered = function (cue, assetInfo) {
        var segment = undefined;
        if (assetInfo.isAd) {
            segment = {
                id: assetInfo.asset,
                index: 0,
                startTime: cue.startTime,
                endTime: cue.startTime + assetInfo.duration,
                type: 'AD'
            };
            var segments = [segment];
            this._currentAdBreak = new ad_break_1.AdBreak(segments);
            this._inAdBreak = true;
            _super.prototype.fire.call(this, events_1.Events.AssetEntered, { segment: segment, asset: assetInfo });
            _super.prototype.fire.call(this, events_1.Events.AdBreakEntered, { adBreak: this._currentAdBreak });
        }
        else {
            this._inAdBreak = false;
            _super.prototype.fire.call(this, events_1.Events.AssetEntered, { segment: undefined, asset: assetInfo });
        }
    };
    NativePlayer.prototype._onNewAssetEncountered = function (cue, previousAsset, newAsset) {
        this._inAdBreak = newAsset.isAd;
        if (previousAsset.isAd && this._currentAdBreak) {
            _super.prototype.fire.call(this, events_1.Events.AssetExited, { segment: this._currentAdBreak.getSegmentAt(0), asset: previousAsset });
            _super.prototype.fire.call(this, events_1.Events.AdBreakExited, { adBreak: this._currentAdBreak });
        }
        else {
            _super.prototype.fire.call(this, events_1.Events.AssetExited, { segment: undefined, asset: previousAsset });
        }
        this._onAssetEncountered(cue, newAsset);
    };
    NativePlayer.prototype.onTextTrackChanged = function (changeTrackEvent) {
    };
    Object.defineProperty(NativePlayer.prototype, "version", {
        get: function () {
            return '02.00.17101600';
        },
        enumerable: true,
        configurable: true
    });
    return NativePlayer;
}(observable_1.Observable));
exports.NativePlayer = NativePlayer;

},{"./ad/ad-break":1,"./events":3,"./id3/id3-handler":5,"./utils/observable":12,"./utils/utils":16,"./web-services/asset-info-service":17,"./web-services/ping-service":18}],8:[function(require,module,exports){
if (!Array.prototype.find) {
    Object.defineProperty(Array.prototype, 'find', {
        value: function (predicate) {
            if (this == null) {
                throw new TypeError('"this" is null or not defined');
            }
            var o = Object(this);
            var len = o.length >>> 0;
            if (typeof predicate !== 'function') {
                throw new TypeError('predicate must be a function');
            }
            var thisArg = arguments[1];
            var k = 0;
            while (k < len) {
                var kValue = o[k];
                if (predicate.call(thisArg, kValue, k, o)) {
                    return kValue;
                }
                k++;
            }
            return undefined;
        }
    });
}

},{}],9:[function(require,module,exports){
if (typeof Object.assign != 'function') {
    (function () {
        Object.assign = function (target) {
            'use strict';
            if (target === undefined || target === null) {
                throw new TypeError('Cannot convert undefined or null to object');
            }
            var output = Object(target);
            for (var index = 1; index < arguments.length; index++) {
                var source = arguments[index];
                if (source !== undefined && source !== null) {
                    for (var nextKey in source) {
                        if (source.hasOwnProperty(nextKey)) {
                            output[nextKey] = source[nextKey];
                        }
                    }
                }
            }
            return output;
        };
    })();
}

},{}],10:[function(require,module,exports){
(function () {
    window.VTTCue = window.VTTCue || window.TextTrackCue;
})();

},{}],11:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("./polyfill/vtt-cue");
require("./polyfill/object");
require("./polyfill/array");
var adaptive_player_1 = require("./adaptive-player");
var native_player_1 = require("./native-player");
function isNativePlaybackSupported() {
    try {
        var video = document.createElement('video');
        if (video.canPlayType) {
            return video.canPlayType('application/vnd.apple.mpegurl') !== '';
        }
    }
    catch (e) {
        return false;
    }
    return false;
}
function isHtmlPlaybackSupported() {
    if ('MediaSource' in window && MediaSource.isTypeSupported) {
        return MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E,mp4a.40.2"');
    }
    return false;
}
function currentScript() {
    var scripts = document.getElementsByTagName('script');
    if (scripts && scripts.length) {
        for (var i = 0; i < scripts.length; i++) {
            if (scripts[i].src.indexOf('uplynk-core.js') > -1 || scripts[i].src.indexOf('uplynk-core.min.js') > -1) {
                return scripts[i];
            }
        }
    }
    return undefined;
}
var loadedUplynkAdaptive = true;
function loadUplynkAdaptivePlayer(video, options, callback) {
    var url = currentScript().src.substring(0, currentScript().src.lastIndexOf('/') + 1) + 'uplynk-adaptive.js';
    var enableWASM = false;
    if (enableWASM && typeof WebAssembly === 'object') {
        callback(new adaptive_player_1.AdaptivePlayer(video, options));
    }
    else if (!isScriptAlreadyIncluded(url)) {
        loadedUplynkAdaptive = false;
        loadScriptAsync(url, function () {
            loadedUplynkAdaptive = true;
            callback(new adaptive_player_1.AdaptivePlayer(video, options));
        });
    }
    else if (loadedUplynkAdaptive) {
        callback(new adaptive_player_1.AdaptivePlayer(video, options));
    }
    else {
        setTimeout(function () {
            loadUplynkAdaptivePlayer(video, options, callback);
        }, 500);
    }
}
function loadScriptAsync(url, callback) {
    var head = document.getElementsByTagName('head')[0];
    var script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = url;
    script.onload = function () {
        callback();
    };
    head.appendChild(script);
}
function isScriptAlreadyIncluded(url) {
    var scripts = document.getElementsByTagName("script");
    if (scripts && scripts.length) {
        for (var i = 0; i < scripts.length; i++) {
            if (scripts[i].src === url) {
                return true;
            }
        }
    }
    return false;
}
function createAdaptivePlayer(video, options, callback) {
    if (options.preferNativePlayback) {
        if (isNativePlaybackSupported()) {
            callback(new native_player_1.NativePlayer(video, options));
            return;
        }
        else if (isHtmlPlaybackSupported()) {
            loadUplynkAdaptivePlayer(video, options, callback);
            return;
        }
    }
    else {
        if (isHtmlPlaybackSupported()) {
            loadUplynkAdaptivePlayer(video, options, callback);
            return;
        }
        else if (isNativePlaybackSupported()) {
            callback(new native_player_1.NativePlayer(video, options));
            return;
        }
    }
    console.warn("no playback mode supported");
    callback(undefined);
}
window.createAdaptivePlayer = createAdaptivePlayer;
window.AdaptivePlayer = adaptive_player_1.AdaptivePlayer;

},{"./adaptive-player":2,"./native-player":7,"./polyfill/array":8,"./polyfill/object":9,"./polyfill/vtt-cue":10}],12:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var string_map_1 = require("./string-map");
var Observable = (function () {
    function Observable() {
        this._listeners = new string_map_1.StringMap();
    }
    Observable.prototype.on = function (label, callback) {
        this._listeners.has(label) || this._listeners.set(label, []);
        this._listeners.get(label).push(callback);
    };
    Observable.prototype.off = function (label, callback) {
        var _this = this;
        var listeners = this._listeners.get(label);
        var index;
        if (listeners && listeners.length) {
            index = listeners.reduce(function (i, listener, index) {
                return (_this._isFunction(listener) && listener === callback) ? i = index : i;
            }, -1);
            if (index > -1) {
                listeners.splice(index, 1);
                this._listeners.set(label, listeners);
                return true;
            }
        }
        return false;
    };
    Observable.prototype.fire = function (label) {
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments[_i];
        }
        var listeners = this._listeners.get(label);
        if (listeners && listeners.length) {
            listeners.forEach(function (listener) {
                listener.apply(void 0, args);
            });
            return true;
        }
        return false;
    };
    Observable.prototype._isFunction = function (obj) {
        return typeof obj == 'function' || false;
    };
    return Observable;
}());
exports.Observable = Observable;

},{"./string-map":14}],13:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var ad_break_1 = require("../ad/ad-break");
var SegmentMap = (function () {
    function SegmentMap(segments) {
        this._segments = segments;
        this._adBreaks = [];
        this._initAdbreaks();
    }
    SegmentMap.prototype.findSegment = function (time) {
        var index = this.getSegmentIndexAt(time);
        return this.getSegmentAt(index);
    };
    SegmentMap.prototype.getSegmentAt = function (index) {
        if (index >= 0 && index < this._segments.length) {
            return this._segments[index];
        }
        return undefined;
    };
    SegmentMap.prototype.getSegmentIndexAt = function (time) {
        for (var i = 0; i < this._segments.length; i++) {
            var segment = this._segments[i];
            if (segment.startTime <= time && time <= segment.endTime) {
                return i;
            }
        }
        return -1;
    };
    Object.defineProperty(SegmentMap.prototype, "length", {
        get: function () {
            return this._segments.length;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(SegmentMap.prototype, "adBreaks", {
        get: function () {
            return this._adBreaks;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(SegmentMap.prototype, "contentSegments", {
        get: function () {
            return this._segments.filter(SegmentMap.isContent);
        },
        enumerable: true,
        configurable: true
    });
    SegmentMap.isAd = function (segment) {
        return segment.type === "AD";
    };
    SegmentMap.isContent = function (segment) {
        return segment.type === "CONTENT";
    };
    SegmentMap.prototype._initAdbreaks = function () {
        var ads = [];
        for (var i = 0; i < this._segments.length; i++) {
            while (i < this._segments.length && SegmentMap.isAd(this._segments[i])) {
                ads.push(this._segments[i]);
                i++;
            }
            if (ads.length > 0) {
                this._adBreaks.push(new ad_break_1.AdBreak(ads));
                ads = [];
            }
        }
    };
    SegmentMap.prototype.inAdBreak = function (time) {
        for (var i = 0; i < this._adBreaks.length; i++) {
            var adBreak = this._adBreaks[i];
            if (adBreak.contains(time)) {
                return true;
            }
        }
        return false;
    };
    SegmentMap.prototype.getAdBreak = function (time) {
        return this._adBreaks.find(function (adBreak) {
            return adBreak.contains(time);
        });
    };
    SegmentMap.prototype.getAdBreaksBetween = function (start, end) {
        return this._adBreaks.filter(function (adBreak) {
            return start <= adBreak.startTime && adBreak.endTime <= end;
        });
    };
    return SegmentMap;
}());
exports.SegmentMap = SegmentMap;

},{"../ad/ad-break":1}],14:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var StringMap = (function () {
    function StringMap() {
        this._map = new Object();
    }
    Object.defineProperty(StringMap.prototype, "size", {
        get: function () {
            return Object.keys(this._map).length;
        },
        enumerable: true,
        configurable: true
    });
    StringMap.prototype.has = function (key) {
        return this._map.hasOwnProperty(key);
    };
    StringMap.prototype.get = function (key) {
        return this._map[key];
    };
    StringMap.prototype.set = function (key, value) {
        this._map[key] = value;
    };
    StringMap.prototype.clear = function () {
        var keys = Object.keys(this._map);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            this._map[key] = null;
            delete this._map[key];
        }
    };
    return StringMap;
}());
exports.StringMap = StringMap;

},{}],15:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var utils_1 = require("./utils");
function getThumbnail(time, segments, assetInfoService, thumbnailSize) {
    if (thumbnailSize === void 0) { thumbnailSize = "small"; }
    if (isNaN(time) || time < 0) {
        time = 0;
    }
    var segment = segments.findSegment(time);
    if (segment) {
        var asset = assetInfoService.getAssetInfo(segment.id);
        if (asset && asset.thumbs) {
            var sliceNumber = getSliceNumber(time, segment, asset);
            var thumb = getThumb(asset, thumbnailSize);
            return {
                url: getThumbnailUrl(asset, sliceNumber, thumb),
                height: thumb.height,
                width: thumb.width
            };
        }
    }
    return {
        url: '',
        height: 0,
        width: 0
    };
}
exports.getThumbnail = getThumbnail;
function getThumbnailUrl(asset, sliceNumber, thumb) {
    var prefix = asset.thumbPrefix;
    if (asset.storagePartitions && asset.storagePartitions.length) {
        for (var i = 0; i < asset.storagePartitions.length; i++) {
            var partition = asset.storagePartitions[i];
            if (partition.start <= sliceNumber && sliceNumber < partition.end) {
                prefix = partition.url;
                break;
            }
        }
    }
    if (prefix[prefix.length - 1] !== '/') {
        prefix += '/';
    }
    var sliceHexNumber = utils_1.toHexString(sliceNumber);
    return "" + prefix + thumb.prefix + sliceHexNumber + ".jpg";
}
function getThumb(asset, size) {
    var thumb = asset.thumbs[0];
    if (size === "large") {
        thumb = asset.thumbs[asset.thumbs.length - 1];
    }
    return thumb;
}
function getSliceNumber(time, segment, asset) {
    var sliceNumber = Math.ceil((time - segment.startTime) / asset.sliceDuration);
    sliceNumber += segment.index;
    if (sliceNumber > asset.maxSlice) {
        sliceNumber = asset.maxSlice;
    }
    return sliceNumber;
}

},{"./utils":16}],16:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function toTimeString(time) {
    if (isNaN(time)) {
        time = 0;
    }
    var negative = (time < 0) ? "-" : "";
    time = Math.abs(time);
    var seconds = (time % 60) | 0;
    var minutes = ((time / 60) % 60) | 0;
    var hours = (((time / 60) / 60) % 60) | 0;
    var showHours = hours > 0;
    var hrStr = hours < 10 ? "0" + hours : "" + hours;
    var minStr = minutes < 10 ? "0" + minutes : "" + minutes;
    var secStr = seconds < 10 ? "0" + seconds : "" + seconds;
    if (showHours) {
        return "" + negative + hrStr + ":" + minStr + ":" + secStr;
    }
    else {
        return "" + negative + minStr + ":" + secStr;
    }
}
exports.toTimeString = toTimeString;
function toHexString(number, minLength) {
    if (minLength === void 0) { minLength = 8; }
    var hex = number.toString(16).toUpperCase();
    while (hex.length < minLength) {
        hex = "0" + hex;
    }
    return hex;
}
exports.toHexString = toHexString;
function base64ToBuffer(b64encoded) {
    return new Uint8Array(atob(b64encoded).split("").map(function (c) { return c.charCodeAt(0); }));
}
exports.base64ToBuffer = base64ToBuffer;
function slice(data, start, end) {
    if (data.slice) {
        return data.slice(start, end);
    }
    if (end) {
        return data.subarray(start, end);
    }
    return data.subarray(start);
}
exports.slice = slice;
function isLocalStorageAvailable() {
    if (!('localStorage' in window)) {
        return false;
    }
    try {
        window.localStorage.setItem('___test', 'OK');
        var result = window.localStorage.getItem('___test');
        window.localStorage.removeItem('___test');
        return (result === 'OK');
    }
    catch (e) {
        return false;
    }
}
exports.isLocalStorageAvailable = isLocalStorageAvailable;
function getProtocol(url) {
    try {
        return new URL(url).protocol;
    }
    catch (_) { }
    var link = document.createElement('a');
    link.setAttribute('href', url);
    return link.protocol;
}
exports.getProtocol = getProtocol;
function isIE11OrEdge() {
    var isIE11 = (navigator.appVersion.indexOf('Windows NT') !== -1) && (navigator.appVersion.indexOf('rv:11') !== -1);
    var isEdge = navigator.appVersion.indexOf('Edge') !== -1;
    return isIE11 || isEdge;
}
exports.isIE11OrEdge = isIE11OrEdge;

},{}],17:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var segment_map_1 = require("../utils/segment-map");
var string_map_1 = require("../utils/string-map");
var TvRating;
(function (TvRating) {
    TvRating[TvRating["NotAvailable"] = -1] = "NotAvailable";
    TvRating[TvRating["NotApplicable"] = 0] = "NotApplicable";
    TvRating[TvRating["TV_Y"] = 1] = "TV_Y";
    TvRating[TvRating["TV_Y7"] = 2] = "TV_Y7";
    TvRating[TvRating["TV_G"] = 3] = "TV_G";
    TvRating[TvRating["TV_PG"] = 4] = "TV_PG";
    TvRating[TvRating["TV_14"] = 5] = "TV_14";
    TvRating[TvRating["TV_MA"] = 6] = "TV_MA";
    TvRating[TvRating["NotRated"] = 7] = "NotRated";
})(TvRating || (TvRating = {}));
var MovieRating;
(function (MovieRating) {
    MovieRating[MovieRating["NotAvailable"] = -1] = "NotAvailable";
    MovieRating[MovieRating["NotApplicable"] = 0] = "NotApplicable";
    MovieRating[MovieRating["G"] = 1] = "G";
    MovieRating[MovieRating["PG"] = 2] = "PG";
    MovieRating[MovieRating["PG_13"] = 3] = "PG_13";
    MovieRating[MovieRating["R"] = 4] = "R";
    MovieRating[MovieRating["NC_17"] = 5] = "NC_17";
    MovieRating[MovieRating["X"] = 6] = "X";
    MovieRating[MovieRating["NotRated"] = 7] = "NotRated";
})(MovieRating || (MovieRating = {}));
var AssetInfo = (function () {
    function AssetInfo(obj, isAd) {
        this.audioOnly = obj.audio_only == 1;
        this.error = obj.error == 1;
        this.tvRating = obj.tv_rating;
        this.storagePartitions = obj.storage_partitions;
        this.maxSlice = obj.max_slice;
        this.thumbPrefix = obj.thumb_prefix;
        this.adData = obj.ad_data;
        this.sliceDuration = obj.slice_dur;
        this.movieRating = obj.movie_rating;
        this.owner = obj.owner;
        this.rates = obj.rates;
        this.thumbs = obj.thumbs;
        this.posterUrl = obj.poster_url;
        this.duration = obj.duration;
        this.defaultPosterUrl = obj.default_poster_url;
        this.description = obj.desc;
        this.ratingFlags = obj.rating_flags;
        this.externalId = obj.external_id;
        this.asset = obj.asset;
        if (isAd == null) {
            this.isAd = obj.is_ad === 1;
        }
        else {
            this.isAd = isAd;
        }
        if (this.thumbs) {
            this.thumbs.sort(function (left, right) {
                return left.width - right.width;
            });
        }
        if (this.storagePartitions && this.storagePartitions.length) {
            for (var i = 0; i < this.storagePartitions.length; i++) {
                this.storagePartitions[i].end = Math.min(this.storagePartitions[i].end, 9007199254740991);
            }
        }
    }
    return AssetInfo;
}());
exports.AssetInfo = AssetInfo;
var AssetInfoService = (function () {
    function AssetInfoService(protocol, domain, sessionId) {
        this._protocol = protocol;
        this._domain = domain;
        this._sessionId = sessionId;
        this._cache = new string_map_1.StringMap();
        this._loadSegments = this._loadSegments.bind(this);
    }
    AssetInfoService.prototype.loadSegmentMap = function (segmentMap, callback) {
        var segments = [];
        for (var i = 0; i < segmentMap.length; i++) {
            var segment = segmentMap.getSegmentAt(i);
            segments.push(segment);
        }
        this._loadSegments(segments, callback);
    };
    AssetInfoService.prototype._loadSegments = function (segments, callback) {
        var _this = this;
        if (segments.length == 0) {
            callback();
            return;
        }
        var segment = segments.shift();
        this.loadSegment(segment, function () {
            _this._loadSegments(segments, callback);
        });
    };
    AssetInfoService.prototype.loadAssetId = function (assetId, isAd, callBack) {
        var _this = this;
        if (this.isLoaded(assetId)) {
            var info = this._cache.get(assetId);
            callBack(info);
            return;
        }
        var url = this._protocol + "//" + this._domain + "/player/assetinfo/" + assetId + ".json";
        if (this._sessionId && this._sessionId != "") {
            url = url + "?pbs=" + this._sessionId;
        }
        var xhr = new XMLHttpRequest();
        xhr.onloadend = function () {
            if (xhr.status == 200) {
                var obj = JSON.parse(xhr.responseText);
                var assetInfo = new AssetInfo(obj, isAd);
                _this._cache.set(assetId, assetInfo);
                callBack(assetInfo);
            }
            else {
                callBack(null);
            }
        };
        xhr.open("GET", url);
        xhr.send();
    };
    AssetInfoService.prototype.loadSegment = function (segment, callBack) {
        var assetId = segment.id;
        var isAd = segment_map_1.SegmentMap.isAd(segment);
        this.loadAssetId(assetId, isAd, callBack);
    };
    AssetInfoService.prototype.isLoaded = function (assetId) {
        return this._cache.has(assetId);
    };
    AssetInfoService.prototype.getAssetInfo = function (assetId) {
        if (this.isLoaded(assetId)) {
            var info = this._cache.get(assetId);
            return info;
        }
        return undefined;
    };
    AssetInfoService.prototype.clear = function () {
        this._cache.clear();
    };
    return AssetInfoService;
}());
exports.AssetInfoService = AssetInfoService;

},{"../utils/segment-map":13,"../utils/string-map":14}],18:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var PingService = (function () {
    function PingService(protocol, domain, sessionId, video) {
        this.START = "start";
        this.SEEK = "seek";
        this._protocol = protocol;
        this._domain = domain;
        this._sessionId = sessionId;
        this._video = video;
        this._pingServer = sessionId != null && sessionId != "";
        this._nextTime = undefined;
        this._sentStartPing = false;
        this._seeking = false;
        this._currentTime = 0.0;
        this._seekFromTime = 0.0;
        this._video = video;
        this._onPlayerPositionChanged = this._onPlayerPositionChanged.bind(this);
        this._onStart = this._onStart.bind(this);
        this._onSeeked = this._onSeeked.bind(this);
        this._onSeeking = this._onSeeking.bind(this);
        if (this._pingServer) {
            this._video.addEventListener('timeupdate', this._onPlayerPositionChanged);
            this._video.addEventListener('playing', this._onStart);
            this._video.addEventListener('seeked', this._onSeeked);
            this._video.addEventListener('seeking', this._onSeeking);
        }
    }
    PingService.prototype._createQueryString = function (event, currentPosition, fromPosition) {
        var VERSION = 3;
        if (event) {
            var str = "v=" + VERSION + "&ev=" + event + "&pt=" + currentPosition;
            if (fromPosition) {
                str += "&ft=" + fromPosition;
            }
            return str;
        }
        return "v=" + VERSION + "&pt=" + currentPosition;
    };
    PingService.prototype._onStart = function () {
        if (this._pingServer && !this._sentStartPing) {
            this._sendPing(this.START, 0);
            this._sentStartPing = true;
        }
    };
    PingService.prototype._onSeeking = function () {
        this._seeking = true;
        this._nextTime = undefined;
        this._seekFromTime = this._currentTime;
    };
    PingService.prototype._onSeeked = function () {
        if (this._pingServer && this._seeking && this._seekFromTime) {
            this._sendPing(this.SEEK, this._currentTime, this._seekFromTime);
            this._seeking = false;
            this._seekFromTime = undefined;
        }
    };
    PingService.prototype._onPlayerPositionChanged = function () {
        this._currentTime = this._video.currentTime;
        if (this._pingServer && !this._seeking && this._nextTime && this._currentTime > this._nextTime) {
            this._nextTime = undefined;
            this._sendPing(null, this._currentTime);
        }
    };
    PingService.prototype._sendPing = function (event, currentPosition, fromPosition) {
        var _this = this;
        var url = this._protocol + "//" + this._domain + "/session/ping/" + this._sessionId + ".json?" + this._createQueryString(event, currentPosition, fromPosition);
        var xhr = new XMLHttpRequest();
        xhr.open("GET", url, true);
        xhr.responseType = "text";
        xhr.onload = function () {
            if (xhr.status === 200) {
                var json = JSON.parse(xhr.responseText);
                _this._nextTime = json.next_time;
                if (_this._nextTime < 0 || json.hasOwnProperty('error')) {
                    _this._pingServer = false;
                    _this._nextTime = undefined;
                    _this._video.removeEventListener('timeupdate', _this._onPlayerPositionChanged);
                    _this._video.removeEventListener('playing', _this._onStart);
                    _this._video.removeEventListener('seeked', _this._onSeeked);
                    _this._video.removeEventListener('seeking', _this._onSeeking);
                }
            }
        };
        xhr.send();
    };
    return PingService;
}());
exports.PingService = PingService;

},{}]},{},[11])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvdHMvYWQvYWQtYnJlYWsudHMiLCJzcmMvdHMvYWRhcHRpdmUtcGxheWVyLnRzIiwic3JjL3RzL2V2ZW50cy50cyIsInNyYy90cy9pZDMvaWQzLWRlY29kZXIudHMiLCJzcmMvdHMvaWQzL2lkMy1oYW5kbGVyLnRzIiwic3JjL3RzL2xpY2Vuc2UtbWFuYWdlci50cyIsInNyYy90cy9uYXRpdmUtcGxheWVyLnRzIiwic3JjL3RzL3BvbHlmaWxsL2FycmF5LnRzIiwic3JjL3RzL3BvbHlmaWxsL29iamVjdC50cyIsInNyYy90cy9wb2x5ZmlsbC92dHQtY3VlLnRzIiwic3JjL3RzL3VwbHluay1jb3JlLnRzIiwic3JjL3RzL3V0aWxzL29ic2VydmFibGUudHMiLCJzcmMvdHMvdXRpbHMvc2VnbWVudC1tYXAudHMiLCJzcmMvdHMvdXRpbHMvc3RyaW5nLW1hcC50cyIsInNyYy90cy91dGlscy90aHVtYm5haWwtaGVscGVyLnRzIiwic3JjL3RzL3V0aWxzL3V0aWxzLnRzIiwic3JjL3RzL3dlYi1zZXJ2aWNlcy9hc3NldC1pbmZvLXNlcnZpY2UudHMiLCJzcmMvdHMvd2ViLXNlcnZpY2VzL3Bpbmctc2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O0FDQUE7SUFPSSxpQkFBWSxRQUFtQjtRQUMzQixFQUFFLENBQUMsQ0FBQyxRQUFRLElBQUksUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2xDLElBQUksQ0FBQyxTQUFTLEdBQUcsUUFBUSxDQUFDO1lBQzFCLElBQUksQ0FBQyxNQUFNLEdBQUcsUUFBUSxDQUFDLE1BQU0sQ0FBQztZQUM5QixJQUFJLENBQUMsU0FBUyxHQUFHLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7WUFDdkMsSUFBSSxDQUFDLE9BQU8sR0FBRyxRQUFRLENBQUMsUUFBUSxDQUFDLE1BQU0s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S0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDO2dCQUNyQixJQUFJLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsQ0FBQztnQkFDeEMsS0FBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDO2dCQUdoQyxFQUFFLENBQUMsQ0FBQyxLQUFJLENBQUMsU0FBUyxHQUFHLENBQUMsSUFBSSxJQUFJLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDckQsS0FBSSxDQUFDLFdBQVcsR0FBRyxLQUFLLENBQUM7b0JBQ3pCLEtBQUksQ0FBQyxTQUFTLEdBQUcsU0FBUyxDQUFDO29CQUUzQixLQUFJLENBQUMsTUFBTSxDQUFDLG1CQUFtQixDQUFDLFlBQVksRUFBRSxLQUFJLENBQUMsd0JBQXdCLENBQUMsQ0FBQztvQkFDN0UsS0FBSSxDQUFDLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxTQUFTLEVBQUUsS0FBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO29CQUMxRCxLQUFJLENBQUMsTUFBTSxDQUFDLG1CQUFtQixDQUFDLFFBQVEsRUFBRSxLQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7b0JBQzFELEtBQUksQ0FBQyxNQUFNLENBQUMsbUJBQW1CLENBQUMsU0FBUyxFQUFFLEtBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztnQkFDaEUsQ0FBQztZQUNMLENBQUM7UUFDTCxDQUFDLENBQUM7UUFFRixHQUFHLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDZixDQUFDO0lBQ0wsa0JBQUM7QUFBRCxDQXpIQSxBQXlIQyxJQUFBO0FBekhZLGtDQUFXIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsImV4cG9ydCBjbGFzcyBBZEJyZWFrIHtcbiAgICByZWFkb25seSBzdGFydFRpbWU6IG51bWJlcjtcbiAgICByZWFkb25seSBlbmRUaW1lOiBudW1iZXI7XG4gICAgcmVhZG9ubHkgZHVyYXRpb246IG51bWJlcjtcbiAgICByZWFkb25seSBudW1BZHM6IG51bWJlcjtcbiAgICBwcml2YXRlIF9zZWdtZW50czogU2VnbWVudFtdO1xuXG4gICAgY29uc3RydWN0b3Ioc2VnbWVudHM6IFNlZ21lbnRbXSkge1xuICAgICAgICBpZiAoc2VnbWVudHMgJiYgc2VnbWVudHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgdGhpcy5fc2VnbWVudHMgPSBzZWdtZW50cztcbiAgICAgICAgICAgIHRoaXMubnVtQWRzID0gc2VnbWVudHMubGVuZ3RoO1xuICAgICAgICAgICAgdGhpcy5zdGFydFRpbWUgPSBzZWdtZW50c1swXS5zdGFydFRpbWU7XG4gICAgICAgICAgICB0aGlzLmVuZFRpbWUgPSBzZWdtZW50c1tzZWdtZW50cy5sZW5ndGggLSAxXS5lbmRUaW1lO1xuICAgICAgICAgICAgdGhpcy5kdXJhdGlvbiA9IHRoaXMuZW5kVGltZSAtIHRoaXMuc3RhcnRUaW1lO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0QWRQb3NpdGlvbkF0KHRpbWU6IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fc2VnbWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGlmICh0aGlzLl9zZWdtZW50c1tpXS5zdGFydFRpbWUgPD0gdGltZSAmJiB0aW1lIDw9IHRoaXMuX3NlZ21lbnRzW2ldLmVuZFRpbWUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gaSArIDE7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gMDtcbiAgICB9XG5cbiAgICBnZXRTZWdtZW50QXQoaW5kZXg6IG51bWJlcik6IFNlZ21lbnQge1xuICAgICAgICBpZih0aGlzLl9zZWdtZW50cyAmJiBpbmRleCA+IC0xICYmIGluZGV4IDwgdGhpcy5fc2VnbWVudHMubGVuZ3RoKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fc2VnbWVudHNbaW5kZXhdO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICBjb250YWlucyh0aW1lOiBudW1iZXIpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc3RhcnRUaW1lIDw9IHRpbWUgJiYgdGltZSA8PSB0aGlzLmVuZFRpbWU7XG4gICAgfVxufSIsImltcG9ydCB7IE9ic2VydmFibGUgfSBmcm9tICcuL3V0aWxzL29ic2VydmFibGUnO1xuaW1wb3J0IHsgQXNzZXRJbmZvLCBBc3NldEluZm9TZXJ2aWNlIH0gZnJvbSAnLi93ZWItc2VydmljZXMvYXNzZXQtaW5mby1zZXJ2aWNlJztcbmltcG9ydCB7IFBpbmdTZXJ2aWNlIH0gZnJvbSAnLi93ZWItc2VydmljZXMvcGluZy1zZXJ2aWNlJztcbmltcG9ydCB7IElEM0hhbmRsZXIsIElEM1RhZ0V2ZW50LCBUeHh4SUQzRnJhbWVFdmVudCwgUHJpdklEM0ZyYW1lRXZlbnQsIFRleHRJRDNGcmFtZUV2ZW50LCBTbGljZUV2ZW50IH0gZnJvbSAnLi9pZDMvaWQzLWhhbmRsZXInO1xuaW1wb3J0IHsgSUQzRGF0YSB9IGZyb20gJy4vaWQzL2lkMy1kYXRhJztcbmltcG9ydCB7IFNlZ21lbnRNYXAgfSBmcm9tICcuL3V0aWxzL3NlZ21lbnQtbWFwJztcbmltcG9ydCAqIGFzIHRodW1iIGZyb20gJy4vdXRpbHMvdGh1bWJuYWlsLWhlbHBlcic7XG5pbXBvcnQgeyBBZEJyZWFrIH0gZnJvbSAnLi9hZC9hZC1icmVhayc7XG5pbXBvcnQgeyBFdmVudHMgfSBmcm9tICcuL2V2ZW50cyc7XG5pbXBvcnQgeyBQbGF5ZXIsIFJlc29sdXRpb24sIE1pbWVUeXBlIH0gZnJvbSAnLi9wbGF5ZXInO1xuaW1wb3J0IHsgaXNMb2NhbFN0b3JhZ2VBdmFpbGFibGUgfSBmcm9tICcuL3V0aWxzL3V0aWxzJztcbmltcG9ydCB7IExpY2Vuc2VNYW5hZ2VyIH0gZnJvbSAnLi9saWNlbnNlLW1hbmFnZXInO1xuaW1wb3J0IHsgYmFzZTY0VG9CdWZmZXIsIGdldFByb3RvY29sLCBpc0lFMTFPckVkZ2UgfSBmcm9tICcuL3V0aWxzL3V0aWxzJztcblxuZXhwb3J0IGNsYXNzIEFkYXB0aXZlUGxheWVyIGV4dGVuZHMgT2JzZXJ2YWJsZSBpbXBsZW1lbnRzIFBsYXllciB7XG4gICAgcHJpdmF0ZSBfdmlkZW86IEhUTUxWaWRlb0VsZW1lbnQ7XG4gICAgcHJpdmF0ZSBfYWRhcHRpdmVTb3VyY2U6IE1vZHVsZS5BZGFwdGl2ZVNvdXJjZTtcbiAgICBwcml2YXRlIF9tZWRpYVNvdXJjZTogTWVkaWFTb3VyY2U7XG4gICAgcHJpdmF0ZSBfdXJsOiBzdHJpbmc7XG4gICAgcHJpdmF0ZSBfb2JqZWN0VXJsOiBzdHJpbmc7XG4gICAgcHJpdmF0ZSBfYXNzZXRJbmZvU2VydmljZTogQXNzZXRJbmZvU2VydmljZTtcbiAgICBwcml2YXRlIF9waW5nU2VydmljZTogUGluZ1NlcnZpY2U7XG4gICAgcHJpdmF0ZSBfaWQzSGFuZGxlcjogSUQzSGFuZGxlcjtcbiAgICBwcml2YXRlIF9zZWdtZW50TWFwOiBTZWdtZW50TWFwO1xuICAgIHByaXZhdGUgX2NvbmZpZzogUGxheWVyT3B0aW9ucztcbiAgICBwcml2YXRlIF9maXJlZFJlYWR5RXZlbnQ6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSBfaXNTYWZhcmk6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSBfaXNGaXJlZm94OiBib29sZWFuO1xuICAgIHByaXZhdGUgX2lzQ2hyb21lOiBib29sZWFuO1xuICAgIHByaXZhdGUgX2lzSUU6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSBfaXNQYXVzZWQ6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSBfdGFyZ2V0VGltZTogbnVtYmVyO1xuICAgIHByaXZhdGUgX2ZvcmNlZEFkQnJlYWs6IEFkQnJlYWs7XG4gICAgcHJpdmF0ZSBfdmlkZW9SZWN0OiBDbGllbnRSZWN0O1xuICAgIHByaXZhdGUgX2VuZGVkOiBib29sZWFuO1xuICAgIHByaXZhdGUgX3VzaW5nQ3VzdG9tVUk6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSBfaW50ZXJ2YWxJZDogbnVtYmVyO1xuICAgIHByaXZhdGUgX2xpY2Vuc2VNYW5hZ2VyOiBMaWNlbnNlTWFuYWdlcjtcbiAgICBwcml2YXRlIF9wcm90b2NvbDogc3RyaW5nO1xuXG4gICAgcHJpdmF0ZSByZWFkb25seSBfZGVmYXVsdHM6IFBsYXllck9wdGlvbnMgPSB7XG4gICAgICAgIGRpc2FibGVTZWVrRHVyaW5nQWRCcmVhazogdHJ1ZSxcbiAgICAgICAgc2hvd1Bvc3RlcjogZmFsc2UsXG4gICAgICAgIGRlYnVnOiBmYWxzZSxcbiAgICAgICAgbGltaXRSZXNvbHV0aW9uVG9WaWV3U2l6ZTogZmFsc2UsXG4gICAgfTtcblxuICAgIGNvbnN0cnVjdG9yKHZpZGVvOiBIVE1MVmlkZW9FbGVtZW50LCBvcHRpb25zPzogUGxheWVyT3B0aW9ucykge1xuICAgICAgICBzdXBlcigpO1xuXG4gICAgICAgIC8vaW5pdCBjb25maWdcbiAgICAgICAgdmFyIGRhdGEgPSB7fTtcblxuICAgICAgICAvL3RyeSBwYXJzaW5nIGRhdGEgYXR0cmlidXRlIGNvbmZpZ1xuICAgICAgICB0cnkgeyBkYXRhID0gSlNPTi5wYXJzZSh2aWRlby5nZXRBdHRyaWJ1dGUoJ2RhdGEtY29uZmlnJykpOyB9XG4gICAgICAgIGNhdGNoIChlKSB7IH1cblxuICAgICAgICAvL21lcmdlIGRlZmF1bHRzIHdpdGggdXNlciBvcHRpb25zXG4gICAgICAgIHRoaXMuX2NvbmZpZyA9IE9iamVjdC5hc3NpZ24oe30sIHRoaXMuX2RlZmF1bHRzLCBvcHRpb25zLCBkYXRhKTtcblxuICAgICAgICB0aGlzLl92aWRlbyA9IHZpZGVvO1xuICAgICAgICB0aGlzLl9pZDNIYW5kbGVyID0gbmV3IElEM0hhbmRsZXIodmlkZW8pO1xuICAgICAgICB0aGlzLl9pZDNIYW5kbGVyLm9uKElEM0hhbmRsZXIuRXZlbnQuSUQzVGFnLCB0aGlzLl9vbklEM1RhZy5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5faWQzSGFuZGxlci5vbihJRDNIYW5kbGVyLkV2ZW50LlR4eHhJRDNGcmFtZSwgdGhpcy5fb25UeHh4SUQzRnJhbWUuYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuX2lkM0hhbmRsZXIub24oSUQzSGFuZGxlci5FdmVudC5Qcml2SUQzRnJhbWUsIHRoaXMuX29uUHJpdklEM0ZyYW1lLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLl9pZDNIYW5kbGVyLm9uKElEM0hhbmRsZXIuRXZlbnQuVGV4dElEM0ZyYW1lLCB0aGlzLl9vblRleHRJRDNGcmFtZS5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5faWQzSGFuZGxlci5vbihJRDNIYW5kbGVyLkV2ZW50LlNsaWNlRW50ZXJlZCwgdGhpcy5fb25TbGljZUVudGVyZWQuYmluZCh0aGlzKSk7XG5cbiAgICAgICAgdGhpcy5fb25WaWRlb1RpbWVVcGRhdGUgPSB0aGlzLl9vblZpZGVvVGltZVVwZGF0ZS5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLl9vblZpZGVvU2Vla2luZyA9IHRoaXMuX29uVmlkZW9TZWVraW5nLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuX29uVmlkZW9TZWVrZWQgPSB0aGlzLl9vblZpZGVvU2Vla2VkLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuX29uTWVkaWFTb3VyY2VPcGVuID0gdGhpcy5fb25NZWRpYVNvdXJjZU9wZW4uYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5fb25WaWRlb1BsYXliYWNrRW5kID0gdGhpcy5fb25WaWRlb1BsYXliYWNrRW5kLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuX29uVGltZXJUaWNrID0gdGhpcy5fb25UaW1lclRpY2suYmluZCh0aGlzKTtcblxuICAgICAgICB0aGlzLl9pc1NhZmFyaSA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9pc0lFID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2lzRmlyZWZveCA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9pc0Nocm9tZSA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9maXJlZFJlYWR5RXZlbnQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fZW5kZWQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fdXNpbmdDdXN0b21VSSA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9pbnRlcnZhbElkID0gMDtcblxuICAgICAgICB0aGlzLl9vdmVycmlkZUN1cnJlbnRUaW1lKCk7XG4gICAgICAgIHRoaXMuX292ZXJyaWRlRW5kZWQoKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vdmVycmlkZUN1cnJlbnRUaW1lKCk6IHZvaWQge1xuICAgICAgICAvL292ZXJyaWRlICdjdXJyZW50VGltZScgcHJvcGVydHkgc28gd2UgY2FuIHByZXZlbnQgdXNlcnMgZnJvbSBzZXR0aW5nIHZpZGVvLmN1cnJlbnRUaW1lLCBhbGxvd2luZyB0aGVtXG4gICAgICAgIC8vIHRvIHNraXAgYWRzLlxuICAgICAgICB2YXIgY3VycmVudFRpbWVQcm9wZXJ0eSA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IoSFRNTE1lZGlhRWxlbWVudC5wcm90b3R5cGUsICdjdXJyZW50VGltZScpO1xuICAgICAgICBpZiAoY3VycmVudFRpbWVQcm9wZXJ0eSkge1xuXG4gICAgICAgICAgICB2YXIgZ2V0Q3VycmVudFRpbWUgPSBjdXJyZW50VGltZVByb3BlcnR5LmdldDtcbiAgICAgICAgICAgIHZhciBzZXRDdXJyZW50VGltZSA9IGN1cnJlbnRUaW1lUHJvcGVydHkuc2V0O1xuXG4gICAgICAgICAgICBsZXQgc2VsZiA9IHRoaXM7XG5cbiAgICAgICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0aGlzLl92aWRlbywgJ2N1cnJlbnRUaW1lJywge1xuICAgICAgICAgICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZ2V0Q3VycmVudFRpbWUuYXBwbHkodGhpcyk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBzZXQ6IGZ1bmN0aW9uICh2YWw6IG51bWJlcikge1xuICAgICAgICAgICAgICAgICAgICBpZiAoc2VsZi5jYW5TZWVrKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYuX2VuZGVkID0gZmFsc2U7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IHBhcnNlRmxvYXQoPGFueT52YWwpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgYWN0dWFsVGltZSA9IHNlbGYuZ2V0U2Vla1RpbWUodmFsKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNldEN1cnJlbnRUaW1lLmFwcGx5KHRoaXMsIFthY3R1YWxUaW1lXSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vY2FsbCBzZWVrIHJpZ2h0IGF3YXkgaW5zdGVhZCBvZiB3YWl0aW5nIGZvciAnc2Vla2luZycgZXZlbnRcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHNvIHBsYXllciBkb2Vzbid0IGhhdmUgdGltZSB0byBkb3duc2hpZnQgdGhpbmtpbmcgaXQgaGFzXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBubyBkYXRhIGF0IHRoZSBjdXJyZW50VGltZSBwb3NpdGlvbiAoVVAtNjAxMCkuXG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxmLl9hZGFwdGl2ZVNvdXJjZS5zZWVrKGFjdHVhbFRpbWUpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBlbnVtZXJhYmxlOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBjb25maWd1cmFibGU6IGZhbHNlLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIF9vdmVycmlkZUVuZGVkKCk6IHZvaWQge1xuICAgICAgICAvL292ZXJyaWRlIGVuZGVkIHByb3BlcnR5IHNvIHdlIGNhbiBtYWtlIGl0IG5vdCByZWFkLW9ubHkuIGFsbG93aW5nIHVzIHRvIGZpcmUgdGhlICdlbmRlZCdcbiAgICAgICAgLy8gZXZlbnQgYW5kIGhhdmUgdGhlIHVpIHJlc3BvbmQgY29ycmVjdGx5XG4gICAgICAgIGxldCBzZWxmID0gdGhpcztcblxuICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkodGhpcy5fdmlkZW8sICdlbmRlZCcsIHtcbiAgICAgICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBzZWxmLl9lbmRlZDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBlbnVtZXJhYmxlOiBmYWxzZSxcbiAgICAgICAgICAgIGNvbmZpZ3VyYWJsZTogZmFsc2UsXG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHN0YXRpYyBnZXQgRXZlbnQoKSB7XG4gICAgICAgIHJldHVybiBFdmVudHM7XG4gICAgfVxuXG4gICAgZGVzdHJveSgpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5fc3RvcE1haW5Mb29wKCk7XG5cbiAgICAgICAgaWYgKHR5cGVvZiB0aGlzLl9hZGFwdGl2ZVNvdXJjZSAhPSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2UuZGVsZXRlKCk7XG4gICAgICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZSA9IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLl9vYmplY3RVcmwpIHtcbiAgICAgICAgICAgIHdpbmRvdy5VUkwucmV2b2tlT2JqZWN0VVJMKHRoaXMuX29iamVjdFVybCk7XG4gICAgICAgICAgICB0aGlzLl9vYmplY3RVcmwgPSBudWxsO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgbG9hZCh1cmw6IHN0cmluZyk6IHZvaWQge1xuXG4gICAgICAgIHRoaXMuX3Byb3RvY29sID0gZ2V0UHJvdG9jb2wodXJsKTtcbiAgICAgICAgLy9JRTExIGFuZCBFZGdlIGRvbid0IHJlZGlyZWN0ICdodHRwOicgdG8gJ2h0dHBzOicgYWZ0ZXIgSFNUUyBoZWFkZXJzIGFyZSByZXR1cm5lZFxuICAgICAgICAvLyBmcm9tIHRoZSBmaXJzdCAnaHR0cHM6JyByZXF1ZXN0LiAgSW5zdGVhZCwgYSA1MDAgZXJyb3IgaXMgcmV0dXJuZWQuICBTbyBqdXN0IGZvcmNlXG4gICAgICAgIC8vICdodHRwczonIGZyb20gdGhlIGdldCBnbyBhbmQgd2UgY2FuIGF2b2lkIHRob3NlIGlzc3Vlcy5cbiAgICAgICAgaWYgKGlzSUUxMU9yRWRnZSgpICYmIHRoaXMuX3Byb3RvY29sID09PSAnaHR0cDonICYmIHRoaXMuX2lzVXBseW5rVXJsKHVybCkpIHtcbiAgICAgICAgICAgIHRoaXMuX3Byb3RvY29sID0gJ2h0dHBzOic7XG4gICAgICAgICAgICB1cmwgPSAnaHR0cHM6JyArIHVybC5zdWJzdHIoNSk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9maXJlZFJlYWR5RXZlbnQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fdXJsID0gdXJsO1xuICAgICAgICB0aGlzLl90YXJnZXRUaW1lID0gdW5kZWZpbmVkO1xuICAgICAgICB0aGlzLl9mb3JjZWRBZEJyZWFrID0gdW5kZWZpbmVkO1xuICAgICAgICB0aGlzLl9lbmRlZCA9IGZhbHNlO1xuXG4gICAgICAgIHRoaXMuX21lZGlhU291cmNlID0gbmV3IE1lZGlhU291cmNlKCk7XG4gICAgICAgIGlmICh0eXBlb2YgdGhpcy5fYWRhcHRpdmVTb3VyY2UgIT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlLmRlbGV0ZSgpO1xuICAgICAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2UgPSB1bmRlZmluZWQ7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl92aWRlby5yZW1vdmVFdmVudExpc3RlbmVyKCd0aW1ldXBkYXRlJywgdGhpcy5fb25WaWRlb1RpbWVVcGRhdGUpO1xuICAgICAgICB0aGlzLl92aWRlby5yZW1vdmVFdmVudExpc3RlbmVyKCdzZWVraW5nJywgdGhpcy5fb25WaWRlb1NlZWtpbmcpO1xuICAgICAgICB0aGlzLl92aWRlby5yZW1vdmVFdmVudExpc3RlbmVyKCdzZWVrZWQnLCB0aGlzLl9vblZpZGVvU2Vla2VkKTtcbiAgICAgICAgdGhpcy5fdmlkZW8ucmVtb3ZlRXZlbnRMaXN0ZW5lcignZW5kZWQnLCB0aGlzLl9vblZpZGVvUGxheWJhY2tFbmQpO1xuXG4gICAgICAgIHRoaXMuX3ZpZGVvLmFkZEV2ZW50TGlzdGVuZXIoJ3RpbWV1cGRhdGUnLCB0aGlzLl9vblZpZGVvVGltZVVwZGF0ZSk7XG4gICAgICAgIHRoaXMuX3ZpZGVvLmFkZEV2ZW50TGlzdGVuZXIoJ3NlZWtpbmcnLCB0aGlzLl9vblZpZGVvU2Vla2luZyk7XG4gICAgICAgIHRoaXMuX3ZpZGVvLmFkZEV2ZW50TGlzdGVuZXIoJ3NlZWtlZCcsIHRoaXMuX29uVmlkZW9TZWVrZWQpO1xuICAgICAgICB0aGlzLl92aWRlby5hZGRFdmVudExpc3RlbmVyKCdlbmRlZCcsIHRoaXMuX29uVmlkZW9QbGF5YmFja0VuZCk7XG4gICAgICAgIC8vIHZpZGVvLm9ubG9hZGVkbWV0YWRhdGEgaXMgdGhlIGZpcnN0IHRpbWUgdGhlIHZpZGVvIHdpZHRoL2hlaWdodCBpcyBhdmFpbGFibGVcbiAgICAgICAgdGhpcy5fdmlkZW8ub25sb2FkZWRtZXRhZGF0YSA9IHRoaXMudXBkYXRlVmlkZW9SZWN0LmJpbmQodGhpcyk7XG5cbiAgICAgICAgdGhpcy5fbWVkaWFTb3VyY2UuYWRkRXZlbnRMaXN0ZW5lcignc291cmNlb3BlbicsIHRoaXMuX29uTWVkaWFTb3VyY2VPcGVuKTtcblxuICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZSA9IG5ldyBNb2R1bGUuQWRhcHRpdmVTb3VyY2UoKTtcbiAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2Uub25CZWFtTG9hZGVkKHRoaXMuX29uQmVhbUxvYWRlZC5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2Uub25UcmFja0xvYWRlZCh0aGlzLl9vblRyYWNrTG9hZGVkLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5vbkxvYWRlZCh0aGlzLl9vblNvdXJjZUxvYWRlZC5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2Uub25Mb2FkRXJyb3IodGhpcy5fb25Mb2FkRXJyb3IuYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlLm9uRHJtRXJyb3IodGhpcy5fb25Ecm1FcnJvci5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2Uub25TZWdtZW50TWFwQ2hhbmdlZCh0aGlzLl9vblNlZ21lbnRNYXBDaGFuZ2VkLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5zdGFydE1haW5Mb29wKHRoaXMuX3N0YXJ0TWFpbkxvb3AuYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlLnN0b3BNYWluTG9vcCh0aGlzLl9zdG9wTWFpbkxvb3AuYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlLnN0YXJ0TGljZW5zZVJlcXVlc3QodGhpcy5fc3RhcnRMaWNlbnNlUmVxdWVzdC5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2Uub25BdWRpb1RyYWNrU3dpdGNoZWQodGhpcy5fb25BdWRpb1RyYWNrU3dpdGNoZWQuYmluZCh0aGlzKSk7XG5cbiAgICAgICAgaWYgKGlzTG9jYWxTdG9yYWdlQXZhaWxhYmxlKCkpIHtcbiAgICAgICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlLnNldExvYWRBbmRTYXZlQmFuZHdpZHRoKHRoaXMuX2xvYWRCYW5kd2lkdGhIaXN0b3J5LmJpbmQodGhpcyksIHRoaXMuX3NhdmVCYW5kd2lkdGhIaXN0b3J5LmJpbmQodGhpcykpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuX29iamVjdFVybCkge1xuICAgICAgICAgICAgd2luZG93LlVSTC5yZXZva2VPYmplY3RVUkwodGhpcy5fb2JqZWN0VXJsKTtcbiAgICAgICAgICAgIHRoaXMuX29iamVjdFVybCA9IG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9vYmplY3RVcmwgPSB3aW5kb3cuVVJMLmNyZWF0ZU9iamVjdFVSTCh0aGlzLl9tZWRpYVNvdXJjZSk7XG4gICAgICAgIHRoaXMuX3ZpZGVvLnNyYyA9IHRoaXMuX29iamVjdFVybDtcbiAgICAgICAgdGhpcy5fdmlkZW8ubG9hZCgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIERldGVybWluZXMgaWYgdGhlIHBsYXllciBjYW4gc2VlayBnaXZlbiBpdCdzIGN1cnJlbnQgcG9zaXRpb24gYW5kXG4gICAgICogd2hldGhlciBvciBub3QgaXQncyBpbiBhbiBhZCBicmVhay5cbiAgICAgKiBAcmV0dXJuIHtib29sZWFufSBUcnVlIGlmIHRoZSBwbGF5ZXIgY2FuIHNlZWssIG90aGVyd2lzZSBmYWxzZS5cbiAgICAgKi9cbiAgICBjYW5TZWVrKCk6IGJvb2xlYW4ge1xuICAgICAgICBpZiAodGhpcy5fYWRhcHRpdmVTb3VyY2UgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMucGxheWxpc3RUeXBlID09PSAnTElWRScgfHwgdGhpcy5wbGF5bGlzdFR5cGUgPT09ICdFVkVOVCcpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgLy9jYW4ndCBwcmV2ZW50IGFsbCBzZWVrcyAodmlhIHVpIG9yIGN1cnJlbnRUaW1lIHByb3BlcnR5KVxuICAgICAgICAvLyB3aXRob3V0IHVzaW5nIGEgY3VzdG9tIHVpIChVUC0zMjY5KS5cbiAgICAgICAgaWYgKCF0aGlzLl91c2luZ0N1c3RvbVVJKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghdGhpcy5fY29uZmlnLmRpc2FibGVTZWVrRHVyaW5nQWRCcmVhaykge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5fc2VnbWVudE1hcCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gIXRoaXMuX3NlZ21lbnRNYXAuaW5BZEJyZWFrKHRoaXMuX3ZpZGVvLmN1cnJlbnRUaW1lKTtcbiAgICB9XG5cbiAgICBnZXRTZWVrVGltZSh0YXJnZXRUaW1lOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICBpZiAodGhpcy5wbGF5bGlzdFR5cGUgPT09ICdMSVZFJyB8fCB0aGlzLnBsYXlsaXN0VHlwZSA9PT0gJ0VWRU5UJykge1xuICAgICAgICAgICAgcmV0dXJuIHRhcmdldFRpbWU7XG4gICAgICAgIH1cblxuICAgICAgICAvL2FsbG93IHVzZXJzIHRvIHNlZWsgYXQgYW55IHRpbWVcbiAgICAgICAgaWYgKCF0aGlzLl9jb25maWcuZGlzYWJsZVNlZWtEdXJpbmdBZEJyZWFrKSB7XG4gICAgICAgICAgICByZXR1cm4gdGFyZ2V0VGltZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghdGhpcy5fdXNpbmdDdXN0b21VSSkge1xuICAgICAgICAgICAgcmV0dXJuIHRhcmdldFRpbWU7XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgY3VycmVudFRpbWUgPSB0aGlzLl92aWRlby5jdXJyZW50VGltZTtcblxuICAgICAgICAvL2FyZSB3ZSBzZWVraW5nIHRvIHRoZSBtaWRkbGUgb2YgYW4gYWQ/XG4gICAgICAgIC8vaWYgc28sIHNlZWsgdG8gYmVnaW5uaW5nIG9mIHRoZSBhZCBhbmQgcGxheSBvbi5cbiAgICAgICAgbGV0IGFkQnJlYWsgPSB0aGlzLl9zZWdtZW50TWFwLmdldEFkQnJlYWsodGFyZ2V0VGltZSk7XG4gICAgICAgIGlmIChhZEJyZWFrKSB7XG4gICAgICAgICAgICByZXR1cm4gYWRCcmVhay5zdGFydFRpbWU7XG4gICAgICAgIH1cblxuICAgICAgICAvL2FyZSB3ZSBza2lwcGluZyBwYXN0IGFueSBhZHMgYnkgc2Vla2luZz9cbiAgICAgICAgbGV0IGFkQnJlYWtzID0gdGhpcy5fc2VnbWVudE1hcC5nZXRBZEJyZWFrc0JldHdlZW4oY3VycmVudFRpbWUsIHRhcmdldFRpbWUpO1xuICAgICAgICBpZiAoYWRCcmVha3MgJiYgYWRCcmVha3MubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgLy9wbGF5IG5lYXJlc3QgYWQgYnJlYWsgdGhlbiBza2lwIHRvIG9yaWdpbmFsIHRhcmdldCB0aW1lXG4gICAgICAgICAgICB0aGlzLl90YXJnZXRUaW1lID0gdGFyZ2V0VGltZTtcbiAgICAgICAgICAgIHRoaXMuX2ZvcmNlZEFkQnJlYWsgPSBhZEJyZWFrc1thZEJyZWFrcy5sZW5ndGggLSAxXTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9mb3JjZWRBZEJyZWFrLnN0YXJ0VGltZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0YXJnZXRUaW1lO1xuICAgIH1cblxuICAgIHB1YmxpYyBzZXRCcm93c2VyKHNhZmFyaTogYm9vbGVhbiwgaWU6IGJvb2xlYW4sIGNocm9tZTogYm9vbGVhbiwgZmlyZWZveDogYm9vbGVhbikge1xuICAgICAgICB0aGlzLl9pc1NhZmFyaSA9IHNhZmFyaTtcbiAgICAgICAgdGhpcy5faXNJRSA9IGllO1xuICAgICAgICB0aGlzLl9pc0ZpcmVmb3ggPSBmaXJlZm94O1xuICAgICAgICB0aGlzLl9pc0Nocm9tZSA9IGNocm9tZTtcbiAgICAgICAgdGhpcy5fdXNpbmdDdXN0b21VSSA9IHRydWU7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25WaWRlb1RpbWVVcGRhdGUoKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLl9hZGFwdGl2ZVNvdXJjZSAmJiB0aGlzLl92aWRlbykge1xuICAgICAgICAgICAgLy9pZiB3ZSBmb3JjZWQgdGhlIHVzZXIgdG8gd2F0Y2ggYW4gYWQgd2hlbiB0aGV5IHRyaWVkIHRvIHNlZWsgcGFzdCBpdCxcbiAgICAgICAgICAgIC8vIHRoaXMgd2lsbCBzZWVrIHRvIHRoZSBkZXNpcmVkIHBvc2l0aW9uIGFmdGVyIHRoZSBhZCBpcyBvdmVyXG4gICAgICAgICAgICBpZiAodGhpcy5fZm9yY2VkQWRCcmVhayAmJiB0aGlzLl92aWRlby5jdXJyZW50VGltZSA+IHRoaXMuX2ZvcmNlZEFkQnJlYWsuZW5kVGltZSkge1xuICAgICAgICAgICAgICAgIGxldCB0YXJnZXRUaW1lID0gdGhpcy5fdGFyZ2V0VGltZTtcbiAgICAgICAgICAgICAgICB0aGlzLl90YXJnZXRUaW1lID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIHRoaXMuX2ZvcmNlZEFkQnJlYWsgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgdGhpcy5fdmlkZW8uY3VycmVudFRpbWUgPSB0YXJnZXRUaW1lO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvL2lmIHRoZSB1c2VyIGNsaWNrcyBvbiB0aGUgdGltZWxpbmUgd2hlbiB1c2luZyB0aGUgYnJvd3NlcidzIG5hdGl2ZSB1aSxcbiAgICAgICAgICAgIC8vIGl0IGNhdXNlcyBhICd0aW1ldXBkYXRlJyBldmVudCBqdXN0IGJlZm9yZSBhICdzZWVrJyBldmVudCwgY2F1c2luZyB0aGVcbiAgICAgICAgICAgIC8vIHVwbHluayBwbGF5ZXIgdG8gc2VsZWN0IHJheSBieSBiYW5kd2lkdGguIHRoZSByZXN1bHQgb2YgdGhhdCBpcyBkb3duc2hpZnRpbmdcbiAgICAgICAgICAgIC8vIHRvIHRoZSBsb3dlc3QgcmF5IHJpZ2h0IGJlZm9yZSB0aGUgc2Vlay4gdGhhdCByYXkgdHlwaWNhbGx5IGlzbid0IGxvYWRlZCB5ZXRcbiAgICAgICAgICAgIC8vIHNvIGFuIGVycm9yIG9jY3VycyBhbmQgdGhlIHNlZWsgZmFpbHMgY2F1c2luZyBwbGF5YmFjayB0byBzdG9wLlxuICAgICAgICAgICAgaWYgKHRoaXMuX2FkYXB0aXZlU291cmNlICYmIHRoaXMuX3ZpZGVvICYmICF0aGlzLl92aWRlby5zZWVraW5nKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2Uub25UaW1lVXBkYXRlKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vYXJlIHdlIGF0IG9yIG5lYXIgdGhlIGVuZCBvZiBhIFZPRCBhc3NldC4gdmlkZW8uY3VycmVudFRpbWUgZG9lc24ndCBhbHdheXMgZXF1YWwgdmlkZW8uZHVyYXRpb24gd2hlbiB0aGUgYnJvd3NlclxuICAgICAgICAgICAgLy8gc3RvcHMgcGxheWJhY2sgYXQgdGhlIGVuZCBvZiBhIFZPRC5cbiAgICAgICAgICAgIGlmICh0aGlzLnBsYXlsaXN0VHlwZSA9PT0gJ1ZPRCcgJiYgIXRoaXMuX2VuZGVkICYmIHRoaXMuX3ZpZGVvLmR1cmF0aW9uIC0gdGhpcy5fdmlkZW8uY3VycmVudFRpbWUgPD0gMC4yNSkge1xuXG4gICAgICAgICAgICAgICAgdGhpcy5fZW5kZWQgPSB0cnVlO1xuXG4gICAgICAgICAgICAgICAgLy9maXJlIHZpZGVvLmVuZGVkIGV2ZW50IG1hbnVhbGx5XG4gICAgICAgICAgICAgICAgdmFyIGV2ZW50ID0gbmV3IEN1c3RvbUV2ZW50KCdlbmRlZCcpO1xuICAgICAgICAgICAgICAgIHRoaXMuX3ZpZGVvLmRpc3BhdGNoRXZlbnQoZXZlbnQpO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5fdmlkZW8ucGF1c2UoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gd2UgY2FuIHJlc3BvbmQgdG8gdmlkZW8gcmVzaXplcyBxdWlja2x5IGJ5IHJ1bm5pbmcgd2l0aGluIF9vblZpZGVvVGltZVVwZGF0ZSgpXG4gICAgICAgICAgICB0aGlzLnVwZGF0ZVZpZGVvUmVjdCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25WaWRlb1NlZWtpbmcoKTogdm9pZCB7XG4gICAgICAgIC8vUGF1c2luZyBkdXJpbmcgc2VlayBzZWVtcyB0byBoZWxwIHNhZmFyaSBvdXQgd2hlbiBzZWVraW5nIGJleW9uZCB0aGVcbiAgICAgICAgLy9lbmQgb2YgaXQncyB2aWRlbyBidWZmZXIsIHBlcmhhcHMgSSB3aWxsIGZpbmQgYW5vdGhlciBzb2x1dGlvbiBhdCBzb21lXG4gICAgICAgIC8vcG9pbnQsIGJ1dCBmb3Igbm93IHRoaXMgaXMgd29ya2luZy5cbiAgICAgICAgaWYgKHRoaXMuX2lzU2FmYXJpICYmICEodGhpcy5wbGF5bGlzdFR5cGUgPT0gXCJFVkVOVFwiIHx8IHRoaXMucGxheWxpc3RUeXBlID09IFwiTElWRVwiKSkge1xuICAgICAgICAgICAgdGhpcy5faXNQYXVzZWQgPSB0aGlzLl92aWRlby5wYXVzZWQ7XG4gICAgICAgICAgICB0aGlzLl92aWRlby5wYXVzZSgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25WaWRlb1NlZWtlZCgpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuX2lzU2FmYXJpICYmICF0aGlzLl9pc1BhdXNlZCAmJiAhKHRoaXMucGxheWxpc3RUeXBlID09IFwiRVZFTlRcIiB8fCB0aGlzLnBsYXlsaXN0VHlwZSA9PSBcIkxJVkVcIikpIHtcbiAgICAgICAgICAgIHRoaXMuX3ZpZGVvLnBsYXkoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgX29uVmlkZW9QbGF5YmFja0VuZCgpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2UudmlkZW9QbGF5YmFja0VuZCgpO1xuICAgIH1cblxuICAgIHByaXZhdGUgX29uTWVkaWFTb3VyY2VPcGVuKCk6IHZvaWQge1xuICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5pbml0aWFsaXplVmlkZW9FbGVtZW50KHRoaXMuX3ZpZGVvLCB0aGlzLl9tZWRpYVNvdXJjZSwgdGhpcy5fY29uZmlnLmRlYnVnKTtcbiAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2UubG9hZCh0aGlzLl91cmwpO1xuICAgIH1cblxuICAgIHByaXZhdGUgX29uSUQzVGFnKGV2ZW50OiBJRDNUYWdFdmVudCk6IHZvaWQge1xuICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5JRDNUYWcsIGV2ZW50KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vblR4eHhJRDNGcmFtZShldmVudDogVHh4eElEM0ZyYW1lRXZlbnQpOiB2b2lkIHtcbiAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuVHh4eElEM0ZyYW1lLCBldmVudCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25Qcml2SUQzRnJhbWUoZXZlbnQ6IFByaXZJRDNGcmFtZUV2ZW50KTogdm9pZCB7XG4gICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLlByaXZJRDNGcmFtZSwgZXZlbnQpO1xuICAgIH1cblxuICAgIHByaXZhdGUgX29uVGV4dElEM0ZyYW1lKGV2ZW50OiBUZXh0SUQzRnJhbWVFdmVudCk6IHZvaWQge1xuICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5UZXh0SUQzRnJhbWUsIGV2ZW50KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vblNsaWNlRW50ZXJlZChldmVudDogU2xpY2VFdmVudCk6IHZvaWQge1xuICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5TbGljZUVudGVyZWQsIGV2ZW50KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vbkJlYW1Mb2FkZWQoKTogdm9pZCB7XG4gICAgICAgIHRoaXMuX2Fzc2V0SW5mb1NlcnZpY2UgPSBuZXcgQXNzZXRJbmZvU2VydmljZSh0aGlzLl9wcm90b2NvbCwgdGhpcy5fYWRhcHRpdmVTb3VyY2UuZG9tYWluLCB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5zZXNzaW9uSWQpO1xuICAgICAgICB0aGlzLl9waW5nU2VydmljZSA9IG5ldyBQaW5nU2VydmljZSh0aGlzLl9wcm90b2NvbCwgdGhpcy5fYWRhcHRpdmVTb3VyY2UuZG9tYWluLCB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5zZXNzaW9uSWQsIHRoaXMuX3ZpZGVvKTtcblxuICAgICAgICB0aGlzLl92aWRlby50ZXh0VHJhY2tzLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIChjaGFuZ2VUcmFja0V2ZW50OiBUcmFja0V2ZW50KSA9PiB7XG4gICAgICAgICAgICB0aGlzLm9uVGV4dFRyYWNrQ2hhbmdlZChjaGFuZ2VUcmFja0V2ZW50KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuQmVhbUxvYWRlZCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25UcmFja0xvYWRlZCgpOiB2b2lkIHtcbiAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuVHJhY2tMb2FkZWQpO1xuXG4gICAgICAgIGlmICghdGhpcy5fZmlyZWRSZWFkeUV2ZW50KSB7XG4gICAgICAgICAgICB0aGlzLl9maXJlZFJlYWR5RXZlbnQgPSB0cnVlO1xuICAgICAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuUmVhZHkpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfc3RhcnRNYWluTG9vcCgpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuX2ludGVydmFsSWQgPT09IDApIHtcbiAgICAgICAgICAgIHRoaXMuX2ludGVydmFsSWQgPSBzZXRJbnRlcnZhbCh0aGlzLl9vblRpbWVyVGljaywgMTUpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfc3RvcE1haW5Mb29wKCk6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy5faW50ZXJ2YWxJZCAhPT0gMCkge1xuICAgICAgICAgICAgY2xlYXJJbnRlcnZhbCh0aGlzLl9pbnRlcnZhbElkKTtcbiAgICAgICAgICAgIHRoaXMuX2ludGVydmFsSWQgPSAwO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25UaW1lclRpY2soKTogdm9pZCB7XG4gICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlLm9uVGljaygpO1xuICAgIH1cblxuICAgIHByaXZhdGUgX2lzVXBseW5rVXJsKHVybDogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgICAgIGNvbnN0IHRlbXAgPSB1cmwudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgcmV0dXJuIHRlbXAuaW5kZXhPZigndXBseW5rLmNvbScpID4gLTEgfHwgdGVtcC5pbmRleE9mKCdkb3dubHluay5jb20nKSA+IC0xO1xuICAgIH1cblxuICAgIHByaXZhdGUgX29uU291cmNlTG9hZGVkKCk6IHZvaWQge1xuICAgICAgICAvL3ByZS1sb2FkIHNlZ21lbnQgbWFwIHNvIGFzc2V0SW5mbyBkYXRhIHdpbGwgYmUgYXZhaWxhYmxlIHdoZW5cbiAgICAgICAgLy8gbmV3IHNlZ21lbnRzIGFyZSBlbmNvdW50ZXJlZC5cbiAgICAgICAgaWYgKCF0aGlzLl9pc1VwbHlua1VybCh0aGlzLl91cmwpKSB7XG4gICAgICAgICAgICAvL0NoZWNrIGlmIHdlIGhhdmUgYW4gdXBseW5rIGFzc2V0LCBpZiBub3QuLi4uIFRoZW4ganVzdCBzdGFydCBwbGF5YmFja1xuICAgICAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2Uuc3RhcnQoKTtcbiAgICAgICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLlNvdXJjZUxvYWRlZCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLl9hc3NldEluZm9TZXJ2aWNlLmxvYWRTZWdtZW50TWFwKHRoaXMuX3NlZ21lbnRNYXAsICgpID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5zdGFydCgpO1xuICAgICAgICAgICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLlNvdXJjZUxvYWRlZCk7XG5cbiAgICAgICAgICAgICAgICAvL3NldCB0aGUgcG9zdGVyIHVybFxuICAgICAgICAgICAgICAgIGlmICh0aGlzLl9jb25maWcuc2hvd1Bvc3RlciAmJiB0aGlzLnBsYXlsaXN0VHlwZSA9PSBcIlZPRFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGxldCBjb250ZW50U2VnbWVudCA9IHRoaXMuX3NlZ21lbnRNYXAuY29udGVudFNlZ21lbnRzWzBdO1xuICAgICAgICAgICAgICAgICAgICBsZXQgY29udGVudEFzc2V0ID0gdGhpcy5fYXNzZXRJbmZvU2VydmljZS5nZXRBc3NldEluZm8oY29udGVudFNlZ21lbnQuaWQpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl92aWRlby5wb3N0ZXIgPSBjb250ZW50QXNzZXQucG9zdGVyVXJsO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25Mb2FkRXJyb3IobWVzc2FnZTogc3RyaW5nLCBjb2RlOiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuTG9hZEVycm9yLCB7IGVycm9yOiBtZXNzYWdlLCBjb2RlOiBjb2RlIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgX29uRHJtRXJyb3IobWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLkRybUVycm9yLCB7IGVycm9yOiBtZXNzYWdlIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgX29uU2VnbWVudE1hcENoYW5nZWQoKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLnBsYXlsaXN0VHlwZSA9PT0gXCJWT0RcIikge1xuICAgICAgICAgICAgaWYgKCF0aGlzLl9zZWdtZW50TWFwKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fc2VnbWVudE1hcCA9IG5ldyBTZWdtZW50TWFwKHRoaXMuX2FkYXB0aXZlU291cmNlLnNlZ21lbnRNYXApO1xuICAgICAgICAgICAgICAgIHRoaXMuX2luaXRTZWdtZW50VGV4dFRyYWNrKCk7XG4gICAgICAgICAgICAgICAgdGhpcy5faW5pdEFkQnJlYWtUZXh0VHJhY2soKTtcblxuICAgICAgICAgICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLlNlZ21lbnRNYXBMb2FkZWQsIHsgc2VnbWVudE1hcDogdGhpcy5fc2VnbWVudE1hcCB9KTtcbiAgICAgICAgICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5Mb2FkZWRBZEJyZWFrcywgeyBhZEJyZWFrczogdGhpcy5fc2VnbWVudE1hcC5hZEJyZWFrcyB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuX3NlZ21lbnRNYXAgPSBuZXcgU2VnbWVudE1hcCh0aGlzLl9hZGFwdGl2ZVNvdXJjZS5zZWdtZW50TWFwKTtcbiAgICAgICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLlNlZ21lbnRNYXBMb2FkZWQsIHsgc2VnbWVudE1hcDogdGhpcy5fc2VnbWVudE1hcCB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgX3N0YXJ0TGljZW5zZVJlcXVlc3QoKTogdm9pZCB7XG4gICAgICAgIC8vY29uc29sZS5sb2coXCJbYWRhcHRpdmUtcGxheWVyLnRzXSBTdGFydCBsaWNlbnNlIHJlcXVlc3QgUFNTSDogXCIgKyB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5wc3NoKTtcblxuICAgICAgICBpZiAodGhpcy5fbGljZW5zZU1hbmFnZXIgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhpcy5fbGljZW5zZU1hbmFnZXIgPSBuZXcgTGljZW5zZU1hbmFnZXIodGhpcy5fdmlkZW8pO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX2xpY2Vuc2VNYW5hZ2VyLnNldEtleVNlcnZlclByZWZpeCh0aGlzLl9hZGFwdGl2ZVNvdXJjZS5rZXlTZXJ2ZXJQcmVmaXgpO1xuICAgICAgICB0aGlzLl9saWNlbnNlTWFuYWdlci5hZGRMaWNlbnNlUmVxdWVzdChiYXNlNjRUb0J1ZmZlcih0aGlzLl9hZGFwdGl2ZVNvdXJjZS5wc3NoKSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfbG9hZEJhbmR3aWR0aEhpc3RvcnkoKTogU2xpY2VEb3dubG9hZE1ldHJpY1tdW10ge1xuICAgICAgICBsZXQgaGlzdG9yeVZlcnNpb24gPSBwYXJzZUludChsb2NhbFN0b3JhZ2UuZ2V0SXRlbShcIlVwbHlua0hpc3RvcnlWZXJzaW9uXCIpLCAxMCkgfHwgMDtcbiAgICAgICAgLy8gQ3VycmVudCB2ZXJzaW9uIGlzIDIuIElmIG9sZGVyIHRoYW4gdGhhdCwgZG9uJ3QgbG9hZCBpdFxuICAgICAgICBpZiAoaGlzdG9yeVZlcnNpb24gPCAyICYmIGxvY2FsU3RvcmFnZS5nZXRJdGVtKFwiVXBseW5rSGlzdG9yeVwiKSAhPSBudWxsKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcIlthZGFwdGl2ZS1wbGF5ZXIudHNdIF9sb2FkQmFuZHdpZHRoSGlzdG9yeSBmb3VuZCBhbiBvbGRlciBoaXN0b3J5IHZlcnNpb24uIFJlbW92aW5nIGl0XCIpO1xuICAgICAgICAgICAgbG9jYWxTdG9yYWdlLnJlbW92ZUl0ZW0oXCJVcGx5bmtIaXN0b3J5XCIpO1xuICAgICAgICAgICAgbG9jYWxTdG9yYWdlLnJlbW92ZUl0ZW0oXCJVcGx5bmtIaXN0b3J5VGltZXN0YW1wXCIpO1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgbGV0IHRpbWVzdGFtcFN0ciA9IGxvY2FsU3RvcmFnZS5nZXRJdGVtKFwiVXBseW5rSGlzdG9yeVRpbWVzdGFtcFwiKTtcbiAgICAgICAgbGV0IHRpbWVzdGFtcCA9IHBhcnNlSW50KHRpbWVzdGFtcFN0ciwgMTApIHx8IDA7XG4gICAgICAgIGxldCBub3cgPSBEYXRlLm5vdygpO1xuXG4gICAgICAgIGNvbnN0IE1BWF9BR0UgPSA2MCAqIDYwICogMTAwMDsgLy8gMSBociwgaW4gbWlsbGlzZWNcbiAgICAgICAgaWYgKG5vdyAtIHRpbWVzdGFtcCA8IE1BWF9BR0UpIHtcbiAgICAgICAgICAgIGxldCBoaXN0b3J5ID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oXCJVcGx5bmtIaXN0b3J5XCIpO1xuICAgICAgICAgICAgcmV0dXJuIEpTT04ucGFyc2UoaGlzdG9yeSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfc2F2ZUJhbmR3aWR0aEhpc3RvcnkoaGlzdG9yeTogU2xpY2VEb3dubG9hZE1ldHJpY1tdW10pOiB2b2lkIHtcbiAgICAgICAgaWYgKGhpc3RvcnkgPT0gbnVsbCkgcmV0dXJuO1xuXG4gICAgICAgIGxldCB0aW1lc3RhbXAgPSBEYXRlLm5vdygpXG4gICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKFwiVXBseW5rSGlzdG9yeVZlcnNpb25cIiwgXCIyXCIpO1xuICAgICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbShcIlVwbHlua0hpc3RvcnlUaW1lc3RhbXBcIiwgdGltZXN0YW1wLnRvU3RyaW5nKCkpO1xuICAgICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbShcIlVwbHlua0hpc3RvcnlcIiwgSlNPTi5zdHJpbmdpZnkoaGlzdG9yeSkpO1xuICAgIH1cblxuICAgIGdldFRodW1ibmFpbCh0aW1lOiBudW1iZXIsIHNpemU6IFwic21hbGxcIiB8IFwibGFyZ2VcIiA9IFwic21hbGxcIik6IHRodW1iLlRodW1ibmFpbCB7XG4gICAgICAgIHJldHVybiB0aHVtYi5nZXRUaHVtYm5haWwodGltZSwgdGhpcy5fc2VnbWVudE1hcCwgdGhpcy5fYXNzZXRJbmZvU2VydmljZSwgc2l6ZSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfaW5pdFNlZ21lbnRUZXh0VHJhY2soKTogdm9pZCB7XG4gICAgICAgIGlmICh0eXBlb2YgVlRUQ3VlID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgLy9iYWlsLCBjYW4ndCBjcmVhdGUgY3Vlc1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IHNlZ21lbnRUZXh0VHJhY2sgPSB0aGlzLl9nZXRPckNyZWF0ZVRleHRUcmFjayhcIm1ldGFkYXRhXCIsIFwic2VnbWVudHNcIik7XG5cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9zZWdtZW50TWFwLmxlbmd0aDsgaSsrKSB7XG5cbiAgICAgICAgICAgIGxldCBzZWdtZW50ID0gdGhpcy5fc2VnbWVudE1hcC5nZXRTZWdtZW50QXQoaSk7XG4gICAgICAgICAgICBsZXQgY3VlID0gbmV3IFZUVEN1ZShzZWdtZW50LnN0YXJ0VGltZSwgc2VnbWVudC5lbmRUaW1lLCBzZWdtZW50LmlkKTtcblxuICAgICAgICAgICAgaWYgKGN1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cbiAgICAgICAgICAgICAgICBjdWUuYWRkRXZlbnRMaXN0ZW5lcihcImVudGVyXCIsICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fYXNzZXRJbmZvU2VydmljZS5sb2FkU2VnbWVudChzZWdtZW50LCAoYXNzZXRJbmZvOiBBc3NldEluZm8pID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLkFzc2V0RW50ZXJlZCwgeyBzZWdtZW50OiBzZWdtZW50LCBhc3NldDogYXNzZXRJbmZvIH0pO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgIGN1ZS5hZGRFdmVudExpc3RlbmVyKFwiZXhpdFwiLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2Fzc2V0SW5mb1NlcnZpY2UubG9hZFNlZ21lbnQoc2VnbWVudCwgKGFzc2V0SW5mbzogQXNzZXRJbmZvKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5Bc3NldEV4aXRlZCwgeyBzZWdtZW50OiBzZWdtZW50LCBhc3NldDogYXNzZXRJbmZvIH0pO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgIHNlZ21lbnRUZXh0VHJhY2suYWRkQ3VlKGN1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIF9pbml0QWRCcmVha1RleHRUcmFjaygpOiB2b2lkIHtcbiAgICAgICAgaWYgKHR5cGVvZiBWVFRDdWUgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICAvL2JhaWwsIGNhbid0IGNyZWF0ZSBjdWVzXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgYWRCcmVha3MgPSB0aGlzLl9zZWdtZW50TWFwLmFkQnJlYWtzO1xuICAgICAgICBpZiAoYWRCcmVha3MubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgdHJhY2sgPSB0aGlzLl9nZXRPckNyZWF0ZVRleHRUcmFjayhcIm1ldGFkYXRhXCIsIFwiYWRicmVha3NcIik7XG5cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhZEJyZWFrcy5sZW5ndGg7IGkrKykge1xuXG4gICAgICAgICAgICBsZXQgYWRCcmVhayA9IGFkQnJlYWtzW2ldO1xuICAgICAgICAgICAgbGV0IGN1ZSA9IG5ldyBWVFRDdWUoYWRCcmVhay5zdGFydFRpbWUsIGFkQnJlYWsuZW5kVGltZSwgXCJhZGJyZWFrXCIpO1xuXG4gICAgICAgICAgICBpZiAoY3VlICE9PSB1bmRlZmluZWQpIHtcblxuICAgICAgICAgICAgICAgIGN1ZS5hZGRFdmVudExpc3RlbmVyKFwiZW50ZXJcIiwgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5BZEJyZWFrRW50ZXJlZCwgeyBhZEJyZWFrOiBhZEJyZWFrIH0pO1xuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgY3VlLmFkZEV2ZW50TGlzdGVuZXIoXCJleGl0XCIsICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuQWRCcmVha0V4aXRlZCwgeyBhZEJyZWFrOiBhZEJyZWFrIH0pO1xuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgdHJhY2suYWRkQ3VlKGN1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5faXNGaXJlZm94ICYmICF0aGlzLl92aWRlby5hdXRvcGxheSAmJiBhZEJyZWFrc1swXS5zdGFydFRpbWUgPT09IDAgJiYgdGhpcy5fdmlkZW8uY3VycmVudFRpbWUgPT09IDApIHtcbiAgICAgICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLkFkQnJlYWtFbnRlcmVkLCB7IGFkQnJlYWs6IGFkQnJlYWtzWzBdIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfZ2V0T3JDcmVhdGVUZXh0VHJhY2soa2luZDogc3RyaW5nLCBsYWJlbDogc3RyaW5nKTogVGV4dFRyYWNrIHtcbiAgICAgICAgLy9sb29rIGZvciBwcmV2aW91c2x5IGNyZWF0ZWQgdHJhY2tcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl92aWRlby50ZXh0VHJhY2tzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBsZXQgdHJhY2sgPSB0aGlzLl92aWRlby50ZXh0VHJhY2tzW2ldO1xuICAgICAgICAgICAgaWYgKHRyYWNrLmtpbmQgPT09IGtpbmQgJiYgdHJhY2subGFiZWwgPT09IGxhYmVsKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRyYWNrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy9yZXR1cm4gbmV3IHRyYWNrXG4gICAgICAgIHJldHVybiB0aGlzLl92aWRlby5hZGRUZXh0VHJhY2soa2luZCwgbGFiZWwpO1xuICAgIH1cblxuICAgIHB1YmxpYyBvblRleHRUcmFja0NoYW5nZWQoY2hhbmdlVHJhY2tFdmVudDogVHJhY2tFdmVudCk6IHZvaWQge1xuICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5vblRleHRUcmFja0NoYW5nZWQoY2hhbmdlVHJhY2tFdmVudCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSB1cGRhdGVWaWRlb1JlY3QoKTogdm9pZCB7XG4gICAgICAgIGxldCBjdXJyZW50VmlkZW9SZWN0ID0gdGhpcy5fdmlkZW8uZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cbiAgICAgICAgaWYgKCghdGhpcy5fdmlkZW9SZWN0KSB8fCAodGhpcy5fdmlkZW9SZWN0LndpZHRoICE9IGN1cnJlbnRWaWRlb1JlY3Qud2lkdGggfHwgdGhpcy5fdmlkZW9SZWN0LmhlaWdodCAhPSBjdXJyZW50VmlkZW9SZWN0LmhlaWdodCkpIHtcbiAgICAgICAgICAgIHRoaXMuX3ZpZGVvUmVjdCA9IGN1cnJlbnRWaWRlb1JlY3Q7XG4gICAgICAgICAgICBpZiAodGhpcy5fYWRhcHRpdmVTb3VyY2UgJiYgdGhpcy5fY29uZmlnLmxpbWl0UmVzb2x1dGlvblRvVmlld1NpemUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5zZXRNYXhWaWRlb1Jlc29sdXRpb24oY3VycmVudFZpZGVvUmVjdC5oZWlnaHQsIGN1cnJlbnRWaWRlb1JlY3Qud2lkdGgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25BdWRpb1RyYWNrU3dpdGNoZWQoKTogdm9pZCB7XG4gICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLkF1ZGlvVHJhY2tTd2l0Y2hlZCk7XG4gICAgfVxuXG4gICAgZ2V0IGF1ZGlvVHJhY2tzKCk6IFVwbHluay5BdWRpb1RyYWNrW10ge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVTb3VyY2UuYXVkaW9UcmFja3M7XG4gICAgfVxuXG4gICAgZ2V0IGF1ZGlvVHJhY2soKTogVXBseW5rLkF1ZGlvVHJhY2sge1xuICAgICAgICBsZXQgYXVkaW9UcmFja3MgPSB0aGlzLmF1ZGlvVHJhY2tzO1xuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYXVkaW9UcmFja3MubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGlmIChhdWRpb1RyYWNrc1tpXS5lbmFibGVkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGF1ZGlvVHJhY2tzW2ldO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgZ2V0IGF1ZGlvVHJhY2tJZCgpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVTb3VyY2UuYXVkaW9UcmFja0lkO1xuICAgIH1cblxuICAgIHNldCBhdWRpb1RyYWNrSWQoaWQ6IG51bWJlcikge1xuICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5hdWRpb1RyYWNrSWQgPSBpZDtcbiAgICB9XG5cbiAgICBnZXQgZG9tYWluKCk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5kb21haW47XG4gICAgfVxuXG4gICAgZ2V0IHNlc3Npb25JZCgpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVTb3VyY2Uuc2Vzc2lvbklkO1xuICAgIH1cblxuICAgIGdldCBudW1iZXJPZlJheXMoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlU291cmNlLm51bWJlck9mUmF5cztcbiAgICB9XG5cbiAgICBnZXQgYXZhaWxhYmxlQmFuZHdpZHRocygpOiBudW1iZXJbXSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5hdmFpbGFibGVCYW5kd2lkdGhzO1xuICAgIH1cblxuICAgIGdldCBhdmFpbGFibGVSZXNvbHV0aW9ucygpOiBSZXNvbHV0aW9uW10ge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVTb3VyY2UuYXZhaWxhYmxlUmVzb2x1dGlvbnM7XG4gICAgfVxuXG4gICAgZ2V0IGF2YWlsYWJsZU1pbWVUeXBlcygpOiBNaW1lVHlwZVtdIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlU291cmNlLmF2YWlsYWJsZU1pbWVUeXBlcztcbiAgICB9XG5cbiAgICBnZXQgc2VnbWVudE1hcCgpOiBTZWdtZW50TWFwIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3NlZ21lbnRNYXA7XG4gICAgfVxuXG4gICAgZ2V0IGFkQnJlYWtzKCk6IEFkQnJlYWtbXSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9zZWdtZW50TWFwLmFkQnJlYWtzO1xuICAgIH1cblxuICAgIGdldCBkdXJhdGlvbigpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVTb3VyY2UgPyB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5kdXJhdGlvbiA6IDA7XG4gICAgfVxuXG4gICAgZ2V0IHBsYXlsaXN0VHlwZSgpOiBcIlZPRFwiIHwgXCJFVkVOVFwiIHwgXCJMSVZFXCIge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVTb3VyY2UucGxheWxpc3RUeXBlO1xuICAgIH1cblxuICAgIGdldCBzdXBwb3J0c1RodW1ibmFpbHMoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLmF2YWlsYWJsZVJlc29sdXRpb25zLmxlbmd0aCA+IDBcbiAgICB9XG5cbiAgICBnZXQgY2xhc3NOYW1lKCk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiAnQWRhcHRpdmVQbGF5ZXInO1xuICAgIH1cblxuICAgIGdldCB2ZXJzaW9uKCk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiAnMDIuMDAuMTcxMDE2MDAnOyAvL3dpbGwgYmUgbW9kaWZpZWQgYnkgdGhlIGJ1aWxkIHNjcmlwdFxuICAgIH1cbn0iLCJleHBvcnQgY29uc3QgRXZlbnRzID0ge1xuICAgIEJlYW1Mb2FkZWQ6ICAgICAgICAgJ2JlYW1sb2FkZWQnLFxuICAgIFRyYWNrTG9hZGVkOiAgICAgICAgJ3RyYWNrbG9hZGVkJyxcbiAgICBTb3VyY2VMb2FkZWQ6ICAgICAgICdzb3VyY2Vsb2FkZWQnLFxuICAgIExvYWRFcnJvcjogICAgICAgICAgJ2xvYWRlcnJvcicsXG4gICAgRHJtRXJyb3I6ICAgICAgICAgICAnZHJtZXJyb3InLFxuICAgIFNlZ21lbnRNYXBMb2FkZWQ6ICAgJ3NlZ21lbnRtYXBMb2FkZWQnLFxuICAgIExvYWRlZEFkQnJlYWtzOiAgICAgJ2xvYWRlZGFkYnJlYWtzJyxcbiAgICBJRDNUYWc6ICAgICAgICAgICAgICdpZDNUYWcnLFxuICAgIFR4eHhJRDNGcmFtZTogICAgICAgJ3R4eHhJZDNGcmFtZScsXG4gICAgUHJpdklEM0ZyYW1lOiAgICAgICAncHJpdklkM0ZyYW1lJyxcbiAgICBUZXh0SUQzRnJhbWU6ICAgICAgICd0ZXh0SWQzRnJhbWUnLFxuICAgIFNsaWNlRW50ZXJlZDogICAgICAgJ3NsaWNlRW50ZXJlZCcsXG4gICAgQXNzZXRFbnRlcmVkOiAgICAgICAnYXNzZXRlbnRlcmVkJyxcbiAgICBBc3NldEV4aXRlZDogICAgICAgICdhc3NldGV4aXRlZCcsXG4gICAgQWRCcmVha0VudGVyZWQ6ICAgICAnYWRicmVha2VudGVyZWQnLFxuICAgIEFkQnJlYWtFeGl0ZWQ6ICAgICAgJ2FkYnJlYWtleGl0ZWQnLFxuICAgIFJlYWR5OiAgICAgICAgICAgICAgJ3JlYWR5JyxcbiAgICBBdWRpb1RyYWNrU3dpdGNoZWQ6ICdhdWRpb1RyYWNrU3dpdGNoZWQnLFxuICAgIEF1ZGlvVHJhY2tBZGRlZDogICAgJ2F1ZGlvVHJhY2tBZGRlZCcsXG59OyIsImltcG9ydCB7IHNsaWNlIH0gZnJvbSAnLi4vdXRpbHMvdXRpbHMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFR4eHhEYXRhIHtcbiAgICB0eXBlOiBzdHJpbmc7XG4gICAga2V5OiBzdHJpbmc7XG4gICAgdmFsdWU6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBUZXh0RnJhbWUge1xuICAgIHZhbHVlOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHh4eEZyYW1lIHtcbiAgICBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICAgIHZhbHVlOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJpdkZyYW1lIHtcbiAgICBvd25lcjogc3RyaW5nO1xuICAgIGRhdGE6IFVpbnQ4QXJyYXk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUQzRnJhbWUge1xuICAgIHR5cGU6IHN0cmluZztcbiAgICBzaXplOiBudW1iZXI7XG4gICAgZGF0YTogVWludDhBcnJheTtcbn1cblxuZXhwb3J0IGNsYXNzIElEM0RlY29kZXIge1xuXG4gICAgc3RhdGljIGdldEZyYW1lKGJ1ZmZlcjogVWludDhBcnJheSk6IElEM0ZyYW1lIHtcbiAgICAgICAgaWYgKGJ1ZmZlci5sZW5ndGggPCAyMSkge1xuICAgICAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8qIGh0dHA6Ly9pZDMub3JnL2lkM3YyLjMuMFxuICAgICAgICArLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0rXG4gICAgICAgIHwgICAgICBIZWFkZXIgKDEwIGJ5dGVzKSAgICAgIHxcbiAgICAgICAgKy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tK1xuICAgICAgICBbMF0gICAgID0gJ0knXG4gICAgICAgIFsxXSAgICAgPSAnRCdcbiAgICAgICAgWzJdICAgICA9ICczJ1xuICAgICAgICBbMyw0XSAgID0ge1ZlcnNpb259XG4gICAgICAgIFs1XSAgICAgPSB7RmxhZ3N9XG4gICAgICAgIFs2LTldICAgPSB7SUQzIFNpemV9XG4gICAgICAgIFsxMC0xM10gPSB7RnJhbWUgSUR9XG4gICAgICAgIFsxNC0xN10gPSB7RnJhbWUgU2l6ZX1cbiAgICAgICAgWzE4LDE5XSA9IHtGcmFtZSBGbGFnc30gXG4gICAgICAgICovXG4gICAgICAgIGlmIChidWZmZXJbMF0gPT09IDczICYmICAvLyBJXG4gICAgICAgICAgICBidWZmZXJbMV0gPT09IDY4ICYmICAvLyBEXG4gICAgICAgICAgICBidWZmZXJbMl0gPT09IDUxKSB7ICAvLyAzXG5cbiAgICAgICAgICAgIGxldCBmcmFtZVR5cGUgPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGJ1ZmZlclsxMF0sIGJ1ZmZlclsxMV0sIGJ1ZmZlclsxMl0sIGJ1ZmZlclsxM10pO1xuXG4gICAgICAgICAgICBsZXQgc2l6ZSA9IDA7XG4gICAgICAgICAgICBzaXplID0gKGJ1ZmZlclsxNF0gPDwgMjQpO1xuICAgICAgICAgICAgc2l6ZSB8PSAoYnVmZmVyWzE1XSA8PCAxNik7XG4gICAgICAgICAgICBzaXplIHw9IChidWZmZXJbMTZdIDw8IDgpO1xuICAgICAgICAgICAgc2l6ZSB8PSBidWZmZXJbMTddO1xuXG4gICAgICAgICAgICBsZXQgZGF0YSA9IHNsaWNlKGJ1ZmZlciwgMjApO1xuICAgICAgICAgICAgcmV0dXJuIHsgdHlwZTogZnJhbWVUeXBlLCBzaXplOiBzaXplLCBkYXRhOiBkYXRhIH07XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIHN0YXRpYyBkZWNvZGVUZXh0RnJhbWUoaWQzRnJhbWU6IElEM0ZyYW1lKTogVGV4dEZyYW1lIHtcbiAgICAgICAgLypcbiAgICAgICAgRm9ybWF0OlxuICAgICAgICBbMF0gICA9IHtUZXh0IEVuY29kaW5nfVxuICAgICAgICBbMS0/XSA9IHtWYWx1ZX1cbiAgICAgICAgKi9cblxuICAgICAgICBpZiAoaWQzRnJhbWUuc2l6ZSA8IDIpIHtcbiAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaWQzRnJhbWUuZGF0YVswXSAhPT0gMykge1xuICAgICAgICAgICAgLy9vbmx5IHN1cHBvcnQgVVRGLThcbiAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGxldCBkYXRhID0gc2xpY2UoaWQzRnJhbWUuZGF0YSwgMSk7XG4gICAgICAgIHJldHVybiB7IHZhbHVlOiBJRDNEZWNvZGVyLnV0ZjhBcnJheVRvU3RyKGRhdGEpIH07XG4gICAgfVxuXG4gICAgc3RhdGljIGRlY29kZVR4eHhGcmFtZShpZDNGcmFtZTogSUQzRnJhbWUpOiBUeHh4RnJhbWUge1xuICAgICAgICAvKlxuICAgICAgICBGb3JtYXQ6XG4gICAgICAgIFswXSAgID0ge1RleHQgRW5jb2Rpbmd9XG4gICAgICAgIFsxLT9dID0ge0Rlc2NyaXB0aW9ufVxcMHtWYWx1ZX1cbiAgICAgICAgKi9cblxuICAgICAgICBpZiAoaWQzRnJhbWUuc2l6ZSA8IDIpIHtcbiAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaWQzRnJhbWUuZGF0YVswXSAhPT0gMykge1xuICAgICAgICAgICAgLy9vbmx5IHN1cHBvcnQgVVRGLThcbiAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgaW5kZXggPSAxO1xuICAgICAgICBsZXQgZGVzY3JpcHRpb24gPSBJRDNEZWNvZGVyLnV0ZjhBcnJheVRvU3RyKHNsaWNlKGlkM0ZyYW1lLmRhdGEsIGluZGV4KSk7XG5cbiAgICAgICAgaW5kZXggKz0gZGVzY3JpcHRpb24ubGVuZ3RoICsgMTtcbiAgICAgICAgbGV0IHZhbHVlID0gSUQzRGVjb2Rlci51dGY4QXJyYXlUb1N0cihzbGljZShpZDNGcmFtZS5kYXRhLCBpbmRleCkpO1xuXG4gICAgICAgIHJldHVybiB7IGRlc2NyaXB0aW9uOiBkZXNjcmlwdGlvbiwgdmFsdWU6IHZhbHVlIH07XG4gICAgfVxuXG4gICAgc3RhdGljIGRlY29kZVByaXZGcmFtZShpZDNGcmFtZTogSUQzRnJhbWUpOiBQcml2RnJhbWUge1xuICAgICAgICAvKlxuICAgICAgICBGb3JtYXQ6IDx0ZXh0IHN0cmluZz5cXDA8YmluYXJ5IGRhdGE+XG4gICAgICAgICovXG5cbiAgICAgICAgaWYgKGlkM0ZyYW1lLnNpemUgPCAyKSB7XG4gICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICB9XG5cbiAgICAgICAgLy9maW5kIG51bGwgdGVybWluYXRvclxuICAgICAgICBsZXQgbnVsbEluZGV4ID0gMDtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBpZDNGcmFtZS5kYXRhLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBpZiAoaWQzRnJhbWUuZGF0YVtpXSA9PT0gMCkge1xuICAgICAgICAgICAgICAgIG51bGxJbmRleCA9IGk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgb3duZXIgPSBTdHJpbmcuZnJvbUNoYXJDb2RlLmFwcGx5KG51bGwsIHNsaWNlKGlkM0ZyYW1lLmRhdGEsIDAsIG51bGxJbmRleCkpO1xuICAgICAgICBsZXQgcHJpdmF0ZURhdGEgPSBzbGljZShpZDNGcmFtZS5kYXRhLCBudWxsSW5kZXggKyAxKTtcblxuICAgICAgICByZXR1cm4geyBvd25lcjogb3duZXIsIGRhdGE6IHByaXZhdGVEYXRhIH07XG4gICAgfVxuXG4gICAgLy8gaHR0cDovL3N0YWNrb3ZlcmZsb3cuY29tL3F1ZXN0aW9ucy84OTM2OTg0L3VpbnQ4YXJyYXktdG8tc3RyaW5nLWluLWphdmFzY3JpcHQvMjIzNzMxOTdcbiAgICAvLyBodHRwOi8vd3d3Lm9uaWNvcy5jb20vc3RhZmYvaXovYW11c2UvamF2YXNjcmlwdC9leHBlcnQvdXRmLnR4dFxuICAgIC8qIHV0Zi5qcyAtIFVURi04IDw9PiBVVEYtMTYgY29udmVydGlvblxuICAgICAqXG4gICAgICogQ29weXJpZ2h0IChDKSAxOTk5IE1hc2FuYW8gSXp1bW8gPGl6QG9uaWNvcy5jby5qcD5cbiAgICAgKiBWZXJzaW9uOiAxLjBcbiAgICAgKiBMYXN0TW9kaWZpZWQ6IERlYyAyNSAxOTk5XG4gICAgICogVGhpcyBsaWJyYXJ5IGlzIGZyZWUuICBZb3UgY2FuIHJlZGlzdHJpYnV0ZSBpdCBhbmQvb3IgbW9kaWZ5IGl0LlxuICAgICAqL1xuICAgIHN0YXRpYyB1dGY4QXJyYXlUb1N0cihhcnJheTogVWludDhBcnJheSk6IHN0cmluZyB7XG5cbiAgICAgICAgbGV0IGNoYXIyOiBhbnk7XG4gICAgICAgIGxldCBjaGFyMzogYW55O1xuICAgICAgICBsZXQgb3V0ID0gXCJcIjtcbiAgICAgICAgbGV0IGkgPSAwO1xuICAgICAgICBsZXQgbGVuZ3RoID0gYXJyYXkubGVuZ3RoO1xuXG4gICAgICAgIHdoaWxlIChpIDwgbGVuZ3RoKSB7XG4gICAgICAgICAgICBsZXQgYyA9IGFycmF5W2krK107XG4gICAgICAgICAgICBzd2l0Y2ggKGMgPj4gNCkge1xuICAgICAgICAgICAgICAgIGNhc2UgMDpcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgICAgICAgICBjYXNlIDE6IGNhc2UgMjogY2FzZSAzOiBjYXNlIDQ6IGNhc2UgNTogY2FzZSA2OiBjYXNlIDc6XG4gICAgICAgICAgICAgICAgICAgIC8vIDB4eHh4eHh4XG4gICAgICAgICAgICAgICAgICAgIG91dCArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGMpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlIDEyOiBjYXNlIDEzOlxuICAgICAgICAgICAgICAgICAgICAvLyAxMTB4IHh4eHggICAxMHh4IHh4eHhcbiAgICAgICAgICAgICAgICAgICAgY2hhcjIgPSBhcnJheVtpKytdO1xuICAgICAgICAgICAgICAgICAgICBvdXQgKz0gU3RyaW5nLmZyb21DaGFyQ29kZSgoKGMgJiAweDFGKSA8PCA2KSB8IChjaGFyMiAmIDB4M0YpKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAxNDpcbiAgICAgICAgICAgICAgICAgICAgLy8gMTExMCB4eHh4ICAxMHh4IHh4eHggIDEweHggeHh4eFxuICAgICAgICAgICAgICAgICAgICBjaGFyMiA9IGFycmF5W2krK107XG4gICAgICAgICAgICAgICAgICAgIGNoYXIzID0gYXJyYXlbaSsrXTtcbiAgICAgICAgICAgICAgICAgICAgb3V0ICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoKChjICYgMHgwRikgPDwgMTIpIHxcbiAgICAgICAgICAgICAgICAgICAgICAgICgoY2hhcjIgJiAweDNGKSA8PCA2KSB8XG4gICAgICAgICAgICAgICAgICAgICAgICAoKGNoYXIzICYgMHgzRikgPDwgMCkpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBvdXQ7XG4gICAgfVxufSIsImltcG9ydCB7IE9ic2VydmFibGUgfSBmcm9tICcuLi91dGlscy9vYnNlcnZhYmxlJztcbmltcG9ydCB7IFR4eHhEYXRhLCBUeHh4RnJhbWUsIFRleHRGcmFtZSwgUHJpdkZyYW1lLCBJRDNGcmFtZSwgSUQzRGVjb2RlciB9IGZyb20gJy4vaWQzLWRlY29kZXInO1xuaW1wb3J0IHsgYmFzZTY0VG9CdWZmZXIgfSBmcm9tICcuLi91dGlscy91dGlscyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHh4eElEM0ZyYW1lRXZlbnQge1xuICAgIGN1ZTogVGV4dFRyYWNrQ3VlO1xuICAgIGZyYW1lOiBUeHh4RnJhbWU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJpdklEM0ZyYW1lRXZlbnQge1xuICAgIGN1ZTogVGV4dFRyYWNrQ3VlO1xuICAgIGZyYW1lOiBQcml2RnJhbWU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVGV4dElEM0ZyYW1lRXZlbnQge1xuICAgIGN1ZTogVGV4dFRyYWNrQ3VlO1xuICAgIGZyYW1lOiBUZXh0RnJhbWU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUQzVGFnRXZlbnQge1xuICAgIGN1ZTogVGV4dFRyYWNrQ3VlO1xuICAgIGZyYW1lOiBJRDNGcmFtZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTbGljZUV2ZW50IHtcbiAgICBjdWU6IFRleHRUcmFja0N1ZTtcbiAgICBhc3NldElkOiBzdHJpbmc7XG4gICAgcmF5Q2hhcjogc3RyaW5nO1xuICAgIHNsaWNlSW5kZXg6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIFdlYktpdFR4eHhDdWUge1xuICAgIGtleTogc3RyaW5nO1xuICAgIGRhdGE6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIFdlYktpdFByaXZDdWUge1xuICAgIGtleTogc3RyaW5nO1xuICAgIGluZm86IHN0cmluZztcbiAgICBkYXRhOiBBcnJheUJ1ZmZlcjtcbn1cblxuZXhwb3J0IGNsYXNzIElEM0hhbmRsZXIgZXh0ZW5kcyBPYnNlcnZhYmxlIHtcbiAgICBjb25zdHJ1Y3Rvcih2aWRlbzogSFRNTFZpZGVvRWxlbWVudCkge1xuICAgICAgICBzdXBlcigpO1xuICAgICAgICB2aWRlby50ZXh0VHJhY2tzLmFkZEV2ZW50TGlzdGVuZXIoJ2FkZHRyYWNrJywgdGhpcy5fb25BZGRUcmFjay5iaW5kKHRoaXMpKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vbkFkZFRyYWNrKGFkZFRyYWNrRXZlbnQ6IGFueSkge1xuICAgICAgICBsZXQgdHJhY2s6IFRleHRUcmFjayA9IGFkZFRyYWNrRXZlbnQudHJhY2s7XG4gICAgICAgIGlmICh0aGlzLl9pc0lkM01ldGFkYXRhVHJhY2sodHJhY2spKSB7XG4gICAgICAgICAgICB0cmFjay5tb2RlID0gJ2hpZGRlbic7XG4gICAgICAgICAgICB0cmFjay5hZGRFdmVudExpc3RlbmVyKCdjdWVjaGFuZ2UnLCB0aGlzLl9vbklEM0N1ZUNoYW5nZS5iaW5kKHRoaXMpKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgX2lzSWQzTWV0YWRhdGFUcmFjayh0cmFjazogVGV4dFRyYWNrKTogYm9vbGVhbiB7XG4gICAgICAgIGlmICh0cmFjay5raW5kID09IFwibWV0YWRhdGFcIiAmJiB0cmFjay5sYWJlbCA9PSBcIklEM1wiKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0cmFjay5raW5kID09IFwibWV0YWRhdGFcIiAmJiB0cmFjay5pbkJhbmRNZXRhZGF0YVRyYWNrRGlzcGF0Y2hUeXBlKSB7XG4gICAgICAgICAgICB2YXIgZGlzcGF0Y2hUeXBlID0gdHJhY2suaW5CYW5kTWV0YWRhdGFUcmFja0Rpc3BhdGNoVHlwZTtcbiAgICAgICAgICAgIHJldHVybiBkaXNwYXRjaFR5cGUgPT09IFwiY29tLmFwcGxlLnN0cmVhbWluZ1wiIHx8IGRpc3BhdGNoVHlwZSA9PT0gXCIxNTI2MERGRkZGNDk0NDMzMjBGRjQ5NDQzMzIwMDAwRlwiO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIHByaXZhdGUgX29uSUQzQ3VlQ2hhbmdlKGN1ZUNoYW5nZUV2ZW50OiBhbnkpIHtcbiAgICAgICAgbGV0IHRyYWNrID0gY3VlQ2hhbmdlRXZlbnQudGFyZ2V0O1xuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdHJhY2suYWN0aXZlQ3Vlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgbGV0IGN1ZSA9IHRyYWNrLmFjdGl2ZUN1ZXNbaV07XG4gICAgICAgICAgICBpZiAoIWN1ZS5vbmVudGVyKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fb25JRDNDdWUoY3VlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdHJhY2suY3Vlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgbGV0IGN1ZSA9IHRyYWNrLmN1ZXNbaV07XG4gICAgICAgICAgICBpZiAoIWN1ZS5vbmVudGVyKSB7XG4gICAgICAgICAgICAgICAgY3VlLm9uZW50ZXIgPSAoY3VlRXZlbnQ6IGFueSkgPT4geyB0aGlzLl9vbklEM0N1ZShjdWVFdmVudC50YXJnZXQpOyB9O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25JRDNDdWUoY3VlOiBUZXh0VHJhY2tDdWUpIHtcbiAgICAgICAgbGV0IGRhdGE6IFVpbnQ4QXJyYXkgPSB1bmRlZmluZWQ7XG4gICAgICAgIGxldCBpZDNGcmFtZTogSUQzRnJhbWUgPSB1bmRlZmluZWQ7XG4gICAgICAgIGxldCB0eHh4RnJhbWU6IFR4eHhGcmFtZSA9IHVuZGVmaW5lZDtcbiAgICAgICAgbGV0IHRleHRGcmFtZTogVGV4dEZyYW1lID0gdW5kZWZpbmVkO1xuICAgICAgICBsZXQgcHJpdkZyYW1lOiBQcml2RnJhbWUgPSB1bmRlZmluZWQ7XG5cbiAgICAgICAgaWYgKCg8YW55PmN1ZSkuZGF0YSkge1xuICAgICAgICAgICAgLy9tcyBlZGdlIChuYXRpdmUpIHB1dHMgaWQzIGRhdGEgaW4gY3VlLmRhdGEgcHJvcGVydHlcbiAgICAgICAgICAgIGRhdGEgPSBuZXcgVWludDhBcnJheSgoPGFueT5jdWUpLmRhdGEpO1xuICAgICAgICB9IGVsc2UgaWYgKCg8YW55PmN1ZSkudmFsdWUgJiYgKDxhbnk+Y3VlKS52YWx1ZS5rZXkgJiYgKDxhbnk+Y3VlKS52YWx1ZS5kYXRhKSB7XG5cbiAgICAgICAgICAgIC8vc2FmYXJpIChuYXRpdmUpIHB1dHMgaWQzIGRhdGEgaW4gV2ViS2l0RGF0YUN1ZSBvYmplY3RzLlxuICAgICAgICAgICAgLy8gbm8gZW5jb2RlZCBkYXRhIGF2YWlsYWJsZS4gc2FmYXJpIGRlY29kZXMgZnJhbWVzIG5hdGl2ZWx5XG4gICAgICAgICAgICAvLyBpLmUuXG4gICAgICAgICAgICAvLyB2YWx1ZToge2tleTogXCJUWFhYXCIsIGRhdGE6IFwiNmMzNTM3ZWMzMzI0NDYxNDlmMWQ1NGRkYmViZWE0MTRfaF8wMDAwMDE0MFwifVxuICAgICAgICAgICAgLy8gb3JcbiAgICAgICAgICAgIC8vIHZhbHVlOiB7a2V5OiBcIlBSSVZcIiwgaW5mbzogXCJjb20uZXNwbi5hdXRobmV0LmhlYXJ0YmVhdFwiLCBkYXRhOiBBcnJheUJ1ZmZlcn1cblxuICAgICAgICAgICAgaWYgKCg8YW55PmN1ZSkudmFsdWUua2V5ID09PSAnVFhYWCcpIHtcbiAgICAgICAgICAgICAgICBsZXQgdHh4eEN1ZTogV2ViS2l0VHh4eEN1ZSA9ICg8YW55PmN1ZSkudmFsdWU7XG4gICAgICAgICAgICAgICAgdHh4eEZyYW1lID0geyB2YWx1ZTogdHh4eEN1ZS5kYXRhLCBkZXNjcmlwdGlvbjogdW5kZWZpbmVkIH07XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCg8YW55PmN1ZSkudmFsdWUua2V5ID09PSAnUFJJVicpIHtcbiAgICAgICAgICAgICAgICBsZXQgcHJpdkN1ZTogV2ViS2l0UHJpdkN1ZSA9ICg8YW55PmN1ZSkudmFsdWU7XG4gICAgICAgICAgICAgICAgcHJpdkZyYW1lID0geyBvd25lcjogcHJpdkN1ZS5pbmZvLCBkYXRhOiBuZXcgVWludDhBcnJheShwcml2Q3VlLmRhdGEpIH07XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvL3VwbHluayBjcmVhdGVkIGlkMyBjdWVzXG4gICAgICAgICAgICBkYXRhID0gYmFzZTY0VG9CdWZmZXIoY3VlLnRleHQpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGRhdGEpIHtcbiAgICAgICAgICAgIGlkM0ZyYW1lID0gSUQzRGVjb2Rlci5nZXRGcmFtZShkYXRhKTtcbiAgICAgICAgICAgIGlmIChpZDNGcmFtZSkge1xuICAgICAgICAgICAgICAgIGlmIChpZDNGcmFtZS50eXBlID09PSAnVFhYWCcpIHtcbiAgICAgICAgICAgICAgICAgICAgdHh4eEZyYW1lID0gSUQzRGVjb2Rlci5kZWNvZGVUeHh4RnJhbWUoaWQzRnJhbWUpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoaWQzRnJhbWUudHlwZSA9PT0gJ1BSSVYnKSB7XG4gICAgICAgICAgICAgICAgICAgIHByaXZGcmFtZSA9IElEM0RlY29kZXIuZGVjb2RlUHJpdkZyYW1lKGlkM0ZyYW1lKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGlkM0ZyYW1lLnR5cGVbMF0gPT09ICdUJykge1xuICAgICAgICAgICAgICAgICAgICB0ZXh0RnJhbWUgPSBJRDNEZWNvZGVyLmRlY29kZVRleHRGcmFtZShpZDNGcmFtZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGlkM0ZyYW1lKSB7XG4gICAgICAgICAgICBsZXQgZXZlbnQ6IElEM1RhZ0V2ZW50ID0geyBjdWU6IGN1ZSwgZnJhbWU6IGlkM0ZyYW1lIH07XG4gICAgICAgICAgICBzdXBlci5maXJlKElEM0hhbmRsZXIuRXZlbnQuSUQzVGFnLCBldmVudCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodHh4eEZyYW1lKSB7XG4gICAgICAgICAgICBsZXQgdHh4eEV2ZW50OiBUeHh4SUQzRnJhbWVFdmVudCA9IHsgY3VlOiBjdWUsIGZyYW1lOiB0eHh4RnJhbWUgfTtcbiAgICAgICAgICAgIHN1cGVyLmZpcmUoSUQzSGFuZGxlci5FdmVudC5UeHh4SUQzRnJhbWUsIHR4eHhFdmVudCk7XG5cbiAgICAgICAgICAgIGlmICh0eHh4RnJhbWUudmFsdWUpIHtcbiAgICAgICAgICAgICAgICBsZXQgc2xpY2VEYXRhID0gdHh4eEZyYW1lLnZhbHVlLnNwbGl0KCdfJyk7XG4gICAgICAgICAgICAgICAgaWYgKHNsaWNlRGF0YS5sZW5ndGggPT0gMykge1xuICAgICAgICAgICAgICAgICAgICBsZXQgc2xpY2VFdmVudDogU2xpY2VFdmVudCA9IHsgY3VlOiBjdWUsIGFzc2V0SWQ6IHNsaWNlRGF0YVswXSwgcmF5Q2hhcjogc2xpY2VEYXRhWzFdLCBzbGljZUluZGV4OiBwYXJzZUludChzbGljZURhdGFbMl0sIDE2KSB9O1xuICAgICAgICAgICAgICAgICAgICBzdXBlci5maXJlKElEM0hhbmRsZXIuRXZlbnQuU2xpY2VFbnRlcmVkLCBzbGljZUV2ZW50KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAocHJpdkZyYW1lKSB7XG4gICAgICAgICAgICBsZXQgcHJpdkV2ZW50OiBQcml2SUQzRnJhbWVFdmVudCA9IHsgY3VlOiBjdWUsIGZyYW1lOiBwcml2RnJhbWUgfTtcbiAgICAgICAgICAgIHN1cGVyLmZpcmUoSUQzSGFuZGxlci5FdmVudC5Qcml2SUQzRnJhbWUsIHByaXZFdmVudCk7XG4gICAgICAgIH0gZWxzZSBpZiAodGV4dEZyYW1lKSB7XG4gICAgICAgICAgICBsZXQgdGV4dEV2ZW50OiBUZXh0SUQzRnJhbWVFdmVudCA9IHsgY3VlOiBjdWUsIGZyYW1lOiB0ZXh0RnJhbWUgfTtcbiAgICAgICAgICAgIHN1cGVyLmZpcmUoSUQzSGFuZGxlci5FdmVudC5UZXh0SUQzRnJhbWUsIHRleHRFdmVudCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBzdGF0aWMgZ2V0IEV2ZW50KCkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgSUQzVGFnOiAnaWQzVGFnJyxcbiAgICAgICAgICAgIFR4eHhJRDNGcmFtZTogJ3R4eHhJZDNGcmFtZScsXG4gICAgICAgICAgICBQcml2SUQzRnJhbWU6ICdwcml2SWQzRnJhbWUnLFxuICAgICAgICAgICAgVGV4dElEM0ZyYW1lOiAndGV4dElkM0ZyYW1lJyxcbiAgICAgICAgICAgIFNsaWNlRW50ZXJlZDogJ3NsaWNlRW50ZXJlZCdcbiAgICAgICAgfTtcbiAgICB9XG59IiwiXG5leHBvcnQgY2xhc3MgTGljZW5zZU1hbmFnZXIge1xuXG4gICAgcmVhZG9ubHkgTElDRU5TRV9UWVBFX05PTkUgPSAwO1xuICAgIHJlYWRvbmx5IExJQ0VOU0VfVFlQRV9XSURFVklORSA9IDE7XG4gICAgcmVhZG9ubHkgTElDRU5TRV9UWVBFX1BMQVlSRUFEWSA9IDI7XG5cbiAgICBwcml2YXRlIF92aWRlbzogSFRNTFZpZGVvRWxlbWVudDtcbiAgICBwcml2YXRlIF9rZXlTZXJ2ZXJQcmVmaXg6IHN0cmluZztcbiAgICBwcml2YXRlIF9saWNlbnNlVHlwZSA9IDA7XG4gICAgcHJpdmF0ZSBfcHNzaDogVWludDhBcnJheTtcbiAgICBwcml2YXRlIF9tZWRpYUtleXM6IE1lZGlhS2V5cztcbiAgICBwcml2YXRlIF9wZW5kaW5nS2V5UmVxdWVzdHM6IHsgaW5pdERhdGFUeXBlOiBzdHJpbmcsIGluaXREYXRhOiBVaW50OEFycmF5IH1bXTtcblxuXG4gICAgcHVibGljIHBsYXlSZWFkeUtleVN5c3RlbSA9IHtcbiAgICAgICAga2V5U3lzdGVtOiAnY29tLm1pY3Jvc29mdC5wbGF5cmVhZHknLFxuICAgICAgICBzdXBwb3J0ZWRDb25maWc6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBpbml0RGF0YVR5cGVzOiBbJ2tleWlkcycsICdjZW5jJ10sXG4gICAgICAgICAgICAgICAgYXVkaW9DYXBhYmlsaXRpZXM6XG4gICAgICAgICAgICAgICAgW1xuICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb250ZW50VHlwZTogJ2F1ZGlvL21wNDsgY29kZWNzPVwibXA0YVwiJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIHJvYnVzdG5lc3M6ICcnXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICAgIHZpZGVvQ2FwYWJpbGl0aWVzOlxuICAgICAgICAgICAgICAgIFtcbiAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29udGVudFR5cGU6ICd2aWRlby9tcDQ7IGNvZGVjcz1cImF2YzFcIicsXG4gICAgICAgICAgICAgICAgICAgICAgICByb2J1c3RuZXNzOiAnJ1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgfVxuICAgICAgICBdXG4gICAgfTtcblxuICAgIHB1YmxpYyB3aWRldmluZUtleVN5c3RlbSA9IHtcbiAgICAgICAga2V5U3lzdGVtOiAnY29tLndpZGV2aW5lLmFscGhhJyxcbiAgICAgICAgc3VwcG9ydGVkQ29uZmlnOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbGFiZWw6ICdmb28nLFxuICAgICAgICAgICAgICAgIGluaXREYXRhVHlwZXM6IFsnY2VuYyddLFxuICAgICAgICAgICAgICAgIHNlc3Npb25UeXBlczogWyd0ZW1wb3JhcnknXSxcbiAgICAgICAgICAgICAgICBhdWRpb0NhcGFiaWxpdGllczpcbiAgICAgICAgICAgICAgICBbXG4gICAgICAgICAgICAgICAgICAgIHsgY29udGVudFR5cGU6ICdhdWRpby9tcDQ7IGNvZGVjcz1cIm1wNGEuNDAuNVwiJywgcm9idXN0bmVzczogJ1NXX1NFQ1VSRV9DUllQVE8nIH1cbiAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICAgIHZpZGVvQ2FwYWJpbGl0aWVzOlxuICAgICAgICAgICAgICAgIFtcbiAgICAgICAgICAgICAgICAgICAgLy8gcm9idXN0bmVzcyBIV19TRUNVUkVfQUxMLCBIV19TRUNVUkVfREVDT0RFLCBIV19TRUNVUkVfQ1JZUFRPLCBTV19TRUNVUkVfREVDT0RFLCBTV19TRUNVUkVfQ1JZUFRPXG4gICAgICAgICAgICAgICAgICAgIHsgY29udGVudFR5cGU6ICd2aWRlby9tcDQ7IGNvZGVjcz1cImF2YzEuNGQwMDFmXCInLCByb2J1c3RuZXNzOiAnSFdfU0VDVVJFX0FMTCcgfSxcbiAgICAgICAgICAgICAgICAgICAgeyBjb250ZW50VHlwZTogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40ZDAwMWZcIicsIHJvYnVzdG5lc3M6ICdIV19TRUNVUkVfREVDT0RFJyB9LFxuICAgICAgICAgICAgICAgICAgICB7IGNvbnRlbnRUeXBlOiAndmlkZW8vbXA0OyBjb2RlY3M9XCJhdmMxLjRkMDAxZlwiJywgcm9idXN0bmVzczogJ0hXX1NFQ1VSRV9DUllQVE8nIH0sXG4gICAgICAgICAgICAgICAgICAgIHsgY29udGVudFR5cGU6ICd2aWRlby9tcDQ7IGNvZGVjcz1cImF2YzEuNGQwMDFmXCInLCByb2J1c3RuZXNzOiAnU1dfU0VDVVJFX0RFQ09ERScgfSxcbiAgICAgICAgICAgICAgICAgICAgeyBjb250ZW50VHlwZTogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40ZDAwMWZcIicsIHJvYnVzdG5lc3M6ICdTV19TRUNVUkVfQ1JZUFRPJyB9LFxuXG4gICAgICAgICAgICAgICAgICAgIHsgY29udGVudFR5cGU6ICd2aWRlby9tcDQ7IGNvZGVjcz1cImF2YzEuNGQwMDFlXCInLCByb2J1c3RuZXNzOiAnSFdfU0VDVVJFX0FMTCcgfSxcbiAgICAgICAgICAgICAgICAgICAgeyBjb250ZW50VHlwZTogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40ZDAwMWVcIicsIHJvYnVzdG5lc3M6ICdTV19TRUNVUkVfQ1JZUFRPJyB9LFxuICAgICAgICAgICAgICAgICAgICB7IGNvbnRlbnRUeXBlOiAndmlkZW8vbXA0OyBjb2RlY3M9XCJhdmMxLjRkMDAxNlwiJywgcm9idXN0bmVzczogJ0hXX1NFQ1VSRV9BTEwnIH0sXG4gICAgICAgICAgICAgICAgICAgIHsgY29udGVudFR5cGU6ICd2aWRlby9tcDQ7IGNvZGVjcz1cImF2YzEuNGQwMDE2XCInLCByb2J1c3RuZXNzOiAnU1dfU0VDVVJFX0NSWVBUTycgfSxcbiAgICAgICAgICAgICAgICAgICAgeyBjb250ZW50VHlwZTogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40MjAwMGRcIicsIHJvYnVzdG5lc3M6ICdIV19TRUNVUkVfQUxMJyB9LFxuICAgICAgICAgICAgICAgICAgICB7IGNvbnRlbnRUeXBlOiAndmlkZW8vbXA0OyBjb2RlY3M9XCJhdmMxLjQyMDAwZFwiJywgcm9idXN0bmVzczogJ1NXX1NFQ1VSRV9DUllQVE8nIH0sXG4gICAgICAgICAgICAgICAgICAgIHsgY29udGVudFR5cGU6ICd2aWRlby9tcDQ7IGNvZGVjcz1cImF2YzEuNDIwMDBjXCInLCByb2J1c3RuZXNzOiAnSFdfU0VDVVJFX0FMTCcgfSxcbiAgICAgICAgICAgICAgICAgICAgeyBjb250ZW50VHlwZTogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40MjAwMGNcIicsIHJvYnVzdG5lc3M6ICdTV19TRUNVUkVfQ1JZUFRPJyB9LFxuICAgICAgICAgICAgICAgICAgICB7IGNvbnRlbnRUeXBlOiAndmlkZW8vbXA0OyBjb2RlY3M9XCJhdmMxLjQyMDAwYlwiJywgcm9idXN0bmVzczogJ0hXX1NFQ1VSRV9BTEwnIH0sXG4gICAgICAgICAgICAgICAgICAgIHsgY29udGVudFR5cGU6ICd2aWRlby9tcDQ7IGNvZGVjcz1cImF2YzEuNDIwMDBiXCInLCByb2J1c3RuZXNzOiAnU1dfU0VDVVJFX0NSWVBUTycgfSxcbiAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9XG4gICAgICAgIF1cbiAgICB9O1xuXG4gICAgY29uc3RydWN0b3IodmlkZW8gOiBIVE1MVmlkZW9FbGVtZW50KSB7XG4gICAgICAgIC8vIGNvbnNvbGUubG9nKFwiTGljZW5zZU1hbmFnZXIgQ1RPUlwiKTtcbiAgICAgICAgdGhpcy5fdmlkZW8gPSB2aWRlbztcbiAgICAgICAgdGhpcy5fa2V5U2VydmVyUHJlZml4ID0gbnVsbDtcbiAgICAgICAgdGhpcy5fcHNzaCA9IG51bGw7XG4gICAgICAgIHRoaXMuX21lZGlhS2V5cyA9IG51bGw7XG4gICAgICAgIHRoaXMuX3BlbmRpbmdLZXlSZXF1ZXN0cyA9IFtdO1xuICAgICAgICB0aGlzLmluaXRNZWRpYUtleXMoKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgYWRkTGljZW5zZVJlcXVlc3QocHNzaERhdGE6IFVpbnQ4QXJyYXkpIHtcbiAgICAgICAgY29uc29sZS5sb2coXCJMaWNlbnNlTWFuYWdlciAtIFJlcXVlc3RpbmcgbGljZW5zZSBmb3IgRFJNIHBsYXliYWNrXCIpO1xuICAgICAgICB0aGlzLl9wZW5kaW5nS2V5UmVxdWVzdHMucHVzaCh7IGluaXREYXRhVHlwZTogJ2NlbmMnLCBpbml0RGF0YTogcHNzaERhdGEgfSk7XG4gICAgICAgIHRoaXMucHJvY2Vzc1BlbmRpbmdLZXlzKHRoaXMpO1xuICAgIH1cblxuICAgIHB1YmxpYyBzZXRLZXlTZXJ2ZXJQcmVmaXgoa2V5U2VydmVyUHJlZml4OiBzdHJpbmcpIHtcbiAgICAgICAgLy8gY29uc29sZS5sb2coXCJLZXlTZXJ2ZXJQcmVmaXg6IFwiICsga2V5U2VydmVyUHJlZml4KTtcbiAgICAgICAgdGhpcy5fa2V5U2VydmVyUHJlZml4ID0ga2V5U2VydmVyUHJlZml4O1xuICAgIH1cblxuICAgIHByaXZhdGUgaW5pdE1lZGlhS2V5cygpIHtcbiAgICAgICAgbGV0IHNlbGYgPSB0aGlzO1xuICAgICAgICB0aGlzLl9tZWRpYUtleXMgPSBudWxsO1xuXG4gICAgICAgIC8vIFRyeSBXaWRldmluZS5cbiAgICAgICAgbmF2aWdhdG9yLnJlcXVlc3RNZWRpYUtleVN5c3RlbUFjY2VzcyhzZWxmLndpZGV2aW5lS2V5U3lzdGVtLmtleVN5c3RlbSwgc2VsZi53aWRldmluZUtleVN5c3RlbS5zdXBwb3J0ZWRDb25maWcpXG4gICAgICAgICAgICAudGhlbihmdW5jdGlvbiAoa2V5U3lzdGVtQWNjZXNzKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fbGljZW5zZVR5cGUgPSBzZWxmLkxJQ0VOU0VfVFlQRV9XSURFVklORTtcblxuICAgICAgICAgICAgICAgIGtleVN5c3RlbUFjY2Vzcy5jcmVhdGVNZWRpYUtleXMoKVxuICAgICAgICAgICAgICAgICAgICAudGhlbihmdW5jdGlvbiAoY3JlYXRlZE1lZGlhS2V5cykge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5vbk1lZGlhS2V5QWNxdWlyZWQoc2VsZiwgY3JlYXRlZE1lZGlhS2V5cyk7XG4gICAgICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnTGljZW5zZU1hbmFnZXIgLSBjcmVhdGVNZWRpYUtleXMoKSBmYWlsZWQgZm9yIFdpZGVWaW5lJylcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LCBmdW5jdGlvbiAoKSB7IGNvbnNvbGUubG9nKCdMaWNlbnNlTWFuYWdlciAtIFlvdXIgYnJvd3Nlci9zeXN0ZW0gZG9lcyBub3Qgc3VwcG9ydCB0aGUgcmVxdWVzdGVkIGNvbmZpZ3VyYXRpb25zIGZvciBwbGF5aW5nIFdpZGVWaW5lIHByb3RlY3RlZCBjb250ZW50LicpOyB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIG9uTWVkaWFLZXlBY3F1aXJlZChzZWxmOiBMaWNlbnNlTWFuYWdlciwgY3JlYXRlZE1lZGlhS2V5czogTWVkaWFLZXlzKSB7XG4gICAgICAgIHNlbGYuX21lZGlhS2V5cyA9IGNyZWF0ZWRNZWRpYUtleXM7XG4gICAgICAgIHNlbGYuX3ZpZGVvLnNldE1lZGlhS2V5cyhzZWxmLl9tZWRpYUtleXMpO1xuICAgICAgICBzZWxmLnByb2Nlc3NQZW5kaW5nS2V5cyhzZWxmKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHByb2Nlc3NQZW5kaW5nS2V5cyhzZWxmOiBMaWNlbnNlTWFuYWdlcikge1xuICAgICAgICBpZiAoc2VsZi5fbWVkaWFLZXlzID09PSBudWxsKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB3aGlsZSAoc2VsZi5fcGVuZGluZ0tleVJlcXVlc3RzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGxldCBkYXRhID0gc2VsZi5fcGVuZGluZ0tleVJlcXVlc3RzLnNoaWZ0KCk7IC8vIHBvcCBmaXJzdCBlbGVtZW50XG4gICAgICAgICAgICBzZWxmLmdldE5ld0tleVNlc3Npb24oZGF0YS5pbml0RGF0YVR5cGUsIGRhdGEuaW5pdERhdGEpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBnZXROZXdLZXlTZXNzaW9uKCBpbml0RGF0YVR5cGU6IHN0cmluZywgaW5pdERhdGE6IFVpbnQ4QXJyYXkpIHtcbiAgICAgICAgbGV0IHNlbGYgPSB0aGlzO1xuICAgICAgICBsZXQga2V5U2Vzc2lvbiA9IHNlbGYuX21lZGlhS2V5cy5jcmVhdGVTZXNzaW9uKFwidGVtcG9yYXJ5XCIpO1xuICAgICAgICBrZXlTZXNzaW9uLmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCBmdW5jdGlvbiAoZXZlbnQ6IE1lZGlhS2V5TWVzc2FnZUV2ZW50KSB7XG4gICAgICAgICAgICAvL2NvbnNvbGUubG9nKCdvbm1lc3NhZ2UgLCBtZXNzYWdlIHR5cGU6ICcgKyBldmVudC5tZXNzYWdlVHlwZSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHNlbGYuZG93bmxvYWROZXdLZXkoc2VsZi5nZXRMaWNlbnNlVXJsKCksIGV2ZW50Lm1lc3NhZ2UsIGZ1bmN0aW9uIChkYXRhOiBBcnJheUJ1ZmZlcikge1xuICAgICAgICAgICAgICAgIC8vY29uc29sZS5sb2coJ2V2ZW50LnRhcmdldC51cGRhdGUsIGRhdGEgYnl0ZXM6ICcgKyBkYXRhLmJ5dGVMZW5ndGgpO1xuICAgICAgICAgICAgICAgIHZhciBwcm9tID0gPFByb21pc2U8dm9pZD4+ICg8TWVkaWFLZXlTZXNzaW9uPmV2ZW50LnRhcmdldCkudXBkYXRlKGRhdGEpO1xuICAgICAgICAgICAgICAgIHByb20uY2F0Y2goZnVuY3Rpb24gKGU6IHN0cmluZykge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnTGljZW5zZU1hbmFnZXIgLSBjYWxsIHRvIE1lZGlhS2V5U2Vzc2lvbi51cGRhdGUoKSBmYWlsZWQnICsgZSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJMaWNlbnNlTWFuYWdlciAtIGZpbmlzaGVkIGxpY2Vuc2UgdXBkYXRlIGZvciBEUk0gcGxheWJhY2tcIik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSwgZmFsc2UpO1xuXG4gICAgICAgIGxldCByZXFQcm9taXNlID0gPFByb21pc2U8dm9pZD4+IGtleVNlc3Npb24uZ2VuZXJhdGVSZXF1ZXN0KGluaXREYXRhVHlwZSwgaW5pdERhdGEpO1xuICAgICAgICByZXFQcm9taXNlLmNhdGNoKGZ1bmN0aW9uIChlIDogc3RyaW5nKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygnTGljZW5zZU1hbmFnZXIgLSBrZXlTZXNzaW9uLmdlbmVyYXRlUmVxdWVzdCgpIGZhaWxlZDogJyArIGUpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGdldExpY2Vuc2VVcmwoKSB7XG4gICAgICAgIGlmICh0aGlzLl9saWNlbnNlVHlwZSA9PT0gdGhpcy5MSUNFTlNFX1RZUEVfUExBWVJFQURZKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fa2V5U2VydmVyUHJlZml4ICsgXCIvcHJcIjtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICh0aGlzLl9saWNlbnNlVHlwZSA9PT0gdGhpcy5MSUNFTlNFX1RZUEVfV0lERVZJTkUpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9rZXlTZXJ2ZXJQcmVmaXggKyBcIi93dlwiO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAnJztcbiAgICB9XG5cbiAgICBwcml2YXRlIGRvd25sb2FkTmV3S2V5KHVybCA6IHN0cmluZywga2V5TWVzc2FnZTogQXJyYXlCdWZmZXIsIGNhbGxiYWNrOiBhbnkpIHsgXG4gICAgICAgIC8vY29uc29sZS5sb2coJ2Rvd25sb2FkTmV3S2V5ICh4aHIpOiAnICsgdXJsKTtcbiAgICAgICAgbGV0IGNoYWxsZW5nZSA6IEFycmF5QnVmZmVyO1xuICAgICAgICBsZXQgeGhyID0gbmV3IFhNTEh0dHBSZXF1ZXN0KCk7XG4gICAgICAgIHhoci5vcGVuKCdQT1NUJywgdXJsLCB0cnVlKTtcbiAgICAgICAgeGhyLndpdGhDcmVkZW50aWFscyA9IHRydWU7XG4gICAgICAgIHhoci5yZXNwb25zZVR5cGUgPSAnYXJyYXlidWZmZXInO1xuICAgICAgICB4aHIub25yZWFkeXN0YXRlY2hhbmdlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKHhoci5yZWFkeVN0YXRlID09PSA0KSB7XG4gICAgICAgICAgICAgICAgaWYgKHhoci5zdGF0dXMgPT09IDIwMCkge1xuICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayh4aHIucmVzcG9uc2UpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93ICdMaWNlbnNlTWFuYWdlciAtIFhIUiBmYWlsZWQgKCcgKyB1cmwgKyAnKS4gU3RhdHVzOiAnICsgeGhyLnN0YXR1cyArICcgKCcgKyB4aHIuc3RhdHVzVGV4dCArICcpJztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIGlmICh0aGlzLl9saWNlbnNlVHlwZSA9PT0gdGhpcy5MSUNFTlNFX1RZUEVfUExBWVJFQURZKSB7XG4gICAgICAgICAgICAvLyAvLyBGb3IgUGxheVJlYWR5IENETXMsIHdlIG5lZWQgdG8gZGlnIHRoZSBDaGFsbGVuZ2Ugb3V0IG9mIHRoZSBYTUwuXG4gICAgICAgICAgICAvLyB2YXIga2V5TWVzc2FnZVhtbCA9IG5ldyBET01QYXJzZXIoKS5wYXJzZUZyb21TdHJpbmcoU3RyaW5nLmZyb21DaGFyQ29kZS5hcHBseShudWxsLCBuZXcgVWludDE2QXJyYXkoa2V5TWVzc2FnZSkpLCAnYXBwbGljYXRpb24veG1sJyk7XG4gICAgICAgICAgICAvLyBpZiAoa2V5TWVzc2FnZVhtbC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnQ2hhbGxlbmdlJylbMF0pIHtcbiAgICAgICAgICAgIC8vICAgICBjaGFsbGVuZ2UgPSBhdG9iKGtleU1lc3NhZ2VYbWwuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ0NoYWxsZW5nZScpWzBdLmNoaWxkTm9kZXNbMF0ubm9kZVZhbHVlKTtcbiAgICAgICAgICAgIC8vIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyAgICAgdGhyb3cgJ0Nhbm5vdCBmaW5kIDxDaGFsbGVuZ2U+IGluIGtleSBtZXNzYWdlJztcbiAgICAgICAgICAgIC8vIH1cbiAgICAgICAgICAgIC8vIHZhciBoZWFkZXJOYW1lcyA9IGtleU1lc3NhZ2VYbWwuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ25hbWUnKTtcbiAgICAgICAgICAgIC8vIHZhciBoZWFkZXJWYWx1ZXMgPSBrZXlNZXNzYWdlWG1sLmdldEVsZW1lbnRzQnlUYWdOYW1lKCd2YWx1ZScpO1xuICAgICAgICAgICAgLy8gaWYgKGhlYWRlck5hbWVzLmxlbmd0aCAhPT0gaGVhZGVyVmFsdWVzLmxlbmd0aCkge1xuICAgICAgICAgICAgLy8gICAgIHRocm93ICdNaXNtYXRjaGVkIGhlYWRlciA8bmFtZT4vPHZhbHVlPiBwYWlyIGluIGtleSBtZXNzYWdlJztcbiAgICAgICAgICAgIC8vIH1cbiAgICAgICAgICAgIC8vIGZvciAodmFyIGkgPSAwOyBpIDwgaGVhZGVyTmFtZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIC8vICAgICB4aHIuc2V0UmVxdWVzdEhlYWRlcihoZWFkZXJOYW1lc1tpXS5jaGlsZE5vZGVzWzBdLm5vZGVWYWx1ZSwgaGVhZGVyVmFsdWVzW2ldLmNoaWxkTm9kZXNbMF0ubm9kZVZhbHVlKTtcbiAgICAgICAgICAgIC8vIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICh0aGlzLl9saWNlbnNlVHlwZSA9PT0gdGhpcy5MSUNFTlNFX1RZUEVfV0lERVZJTkUpe1xuICAgICAgICAgICAgLy8gRm9yIFdpZGV2aW5lIENETXMsIHRoZSBjaGFsbGVuZ2UgaXMgdGhlIGtleU1lc3NhZ2UuXG4gICAgICAgICAgICBjaGFsbGVuZ2UgPSBrZXlNZXNzYWdlO1xuICAgICAgICB9XG5cbiAgICAgICAgeGhyLnNlbmQoY2hhbGxlbmdlKTtcbiAgICB9XG59XG4iLCJpbXBvcnQgeyBPYnNlcnZhYmxlIH0gZnJvbSAnLi91dGlscy9vYnNlcnZhYmxlJztcbmltcG9ydCB7IEV2ZW50cyB9IGZyb20gJy4vZXZlbnRzJztcbmltcG9ydCB7IFBsYXllciwgUmVzb2x1dGlvbiwgTWltZVR5cGUgfSBmcm9tICcuL3BsYXllcic7XG5pbXBvcnQgKiBhcyB0aHVtYiBmcm9tICcuL3V0aWxzL3RodW1ibmFpbC1oZWxwZXInO1xuaW1wb3J0IHsgU2VnbWVudE1hcCB9IGZyb20gJy4vdXRpbHMvc2VnbWVudC1tYXAnO1xuaW1wb3J0IHsgQWRCcmVhayB9IGZyb20gJy4vYWQvYWQtYnJlYWsnO1xuaW1wb3J0IHsgSUQzSGFuZGxlciwgSUQzVGFnRXZlbnQsIFR4eHhJRDNGcmFtZUV2ZW50LCBQcml2SUQzRnJhbWVFdmVudCwgVGV4dElEM0ZyYW1lRXZlbnQsIFNsaWNlRXZlbnQgfSBmcm9tICcuL2lkMy9pZDMtaGFuZGxlcic7XG5pbXBvcnQgeyBJRDNEYXRhIH0gZnJvbSAnLi9pZDMvaWQzLWRhdGEnO1xuaW1wb3J0IHsgQXNzZXRJbmZvLCBBc3NldEluZm9TZXJ2aWNlIH0gZnJvbSAnLi93ZWItc2VydmljZXMvYXNzZXQtaW5mby1zZXJ2aWNlJztcbmltcG9ydCB7IFBpbmdTZXJ2aWNlIH0gZnJvbSAnLi93ZWItc2VydmljZXMvcGluZy1zZXJ2aWNlJztcbmltcG9ydCB7IGdldFByb3RvY29sIH0gZnJvbSAnLi91dGlscy91dGlscyc7XG5cbmV4cG9ydCBjbGFzcyBOYXRpdmVQbGF5ZXIgZXh0ZW5kcyBPYnNlcnZhYmxlIGltcGxlbWVudHMgUGxheWVyIHtcbiAgICBwcml2YXRlIF92aWRlbzogSFRNTFZpZGVvRWxlbWVudDtcbiAgICBwcml2YXRlIF91cmw6IHN0cmluZztcbiAgICBwcml2YXRlIF9wbGF5bGlzdFR5cGU6IFwiVk9EXCIgfCBcIkVWRU5UXCIgfCBcIkxJVkVcIjtcbiAgICBwcml2YXRlIF9pZDNIYW5kbGVyOiBJRDNIYW5kbGVyO1xuICAgIHByaXZhdGUgX2ZpcmVkUmVhZHlFdmVudDogYm9vbGVhbjtcbiAgICBwcml2YXRlIF9hc3NldEluZm9TZXJ2aWNlOiBBc3NldEluZm9TZXJ2aWNlO1xuICAgIHByaXZhdGUgX3BpbmdTZXJ2aWNlOiBQaW5nU2VydmljZTtcbiAgICBwcml2YXRlIF9zZXNzaW9uSWQ6IHN0cmluZztcbiAgICBwcml2YXRlIF9kb21haW46IHN0cmluZztcbiAgICBwcml2YXRlIF9jdXJyZW50QXNzZXRJZDogc3RyaW5nO1xuICAgIHByaXZhdGUgX2NvbmZpZzogUGxheWVyT3B0aW9ucztcbiAgICBwcml2YXRlIF9pbkFkQnJlYWs6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSBfY3VycmVudEFkQnJlYWs6IEFkQnJlYWs7XG4gICAgcHJpdmF0ZSBfcHJvdG9jb2w6IHN0cmluZztcblxuICAgIC8vZG8gbm90aGluZyBwcm9wZXJ0aWVzXG4gICAgcmVhZG9ubHkgbnVtYmVyT2ZSYXlzOiBudW1iZXI7XG4gICAgcmVhZG9ubHkgYXZhaWxhYmxlQmFuZHdpZHRoczogbnVtYmVyW107XG4gICAgcmVhZG9ubHkgYXZhaWxhYmxlUmVzb2x1dGlvbnM6IFJlc29sdXRpb25bXTtcbiAgICByZWFkb25seSBhdmFpbGFibGVNaW1lVHlwZXM6IE1pbWVUeXBlW107XG4gICAgcmVhZG9ubHkgc2VnbWVudE1hcDogU2VnbWVudE1hcDtcbiAgICByZWFkb25seSBhZEJyZWFrczogQWRCcmVha1tdO1xuICAgIHJlYWRvbmx5IGlzQXVkaW9Pbmx5OiBib29sZWFuO1xuXG4gICAgcHJpdmF0ZSByZWFkb25seSBfZGVmYXVsdHM6IFBsYXllck9wdGlvbnMgPSB7XG4gICAgICAgIGRpc2FibGVTZWVrRHVyaW5nQWRCcmVhazogdHJ1ZSxcbiAgICAgICAgc2hvd1Bvc3RlcjogZmFsc2UsXG4gICAgICAgIGRlYnVnOiBmYWxzZVxuICAgIH07XG5cbiAgICBjb25zdHJ1Y3Rvcih2aWRlbzogSFRNTFZpZGVvRWxlbWVudCwgb3B0aW9ucz86IFBsYXllck9wdGlvbnMpIHtcbiAgICAgICAgc3VwZXIoKTtcblxuICAgICAgICAvL2luaXQgY29uZmlnXG4gICAgICAgIHZhciBkYXRhID0ge307XG5cbiAgICAgICAgLy90cnkgcGFyc2luZyBkYXRhIGF0dHJpYnV0ZSBjb25maWdcbiAgICAgICAgdHJ5IHsgZGF0YSA9IEpTT04ucGFyc2UodmlkZW8uZ2V0QXR0cmlidXRlKCdkYXRhLWNvbmZpZycpKTsgfVxuICAgICAgICBjYXRjaCAoZSkgeyB9XG5cbiAgICAgICAgLy9tZXJnZSBkZWZhdWx0cyB3aXRoIHVzZXIgb3B0aW9uc1xuICAgICAgICB0aGlzLl9jb25maWcgPSBPYmplY3QuYXNzaWduKHt9LCB0aGlzLl9kZWZhdWx0cywgb3B0aW9ucywgZGF0YSk7XG5cbiAgICAgICAgdGhpcy5fdmlkZW8gPSB2aWRlbztcbiAgICAgICAgdGhpcy5faWQzSGFuZGxlciA9IG5ldyBJRDNIYW5kbGVyKHZpZGVvKTtcbiAgICAgICAgdGhpcy5faWQzSGFuZGxlci5vbihJRDNIYW5kbGVyLkV2ZW50LklEM1RhZywgdGhpcy5fb25JRDNUYWcuYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuX2lkM0hhbmRsZXIub24oSUQzSGFuZGxlci5FdmVudC5UeHh4SUQzRnJhbWUsIHRoaXMuX29uVHh4eElEM0ZyYW1lLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLl9pZDNIYW5kbGVyLm9uKElEM0hhbmRsZXIuRXZlbnQuUHJpdklEM0ZyYW1lLCB0aGlzLl9vblByaXZJRDNGcmFtZS5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5faWQzSGFuZGxlci5vbihJRDNIYW5kbGVyLkV2ZW50LlRleHRJRDNGcmFtZSwgdGhpcy5fb25UZXh0SUQzRnJhbWUuYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuX2lkM0hhbmRsZXIub24oSUQzSGFuZGxlci5FdmVudC5TbGljZUVudGVyZWQsIHRoaXMuX29uU2xpY2VFbnRlcmVkLmJpbmQodGhpcykpO1xuXG4gICAgICAgIHRoaXMuX29uRHVyYXRpb25DaGFuZ2UgPSB0aGlzLl9vbkR1cmF0aW9uQ2hhbmdlLmJpbmQodGhpcyk7XG5cbiAgICAgICAgdGhpcy5fb3ZlcnJpZGVDdXJyZW50VGltZSgpO1xuICAgIH1cblxuICAgIHB1YmxpYyBsb2FkKHVybDogc3RyaW5nKTogdm9pZCB7XG5cbiAgICAgICAgdGhpcy5fcHJvdG9jb2wgPSBnZXRQcm90b2NvbCh1cmwpO1xuXG4gICAgICAgIHRoaXMuX2ZpcmVkUmVhZHlFdmVudCA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9jdXJyZW50QXNzZXRJZCA9IG51bGw7XG5cbiAgICAgICAgdGhpcy5fdmlkZW8ucmVtb3ZlRXZlbnRMaXN0ZW5lcignZHVyYXRpb25jaGFuZ2UnLCB0aGlzLl9vbkR1cmF0aW9uQ2hhbmdlKTtcbiAgICAgICAgdGhpcy5fdmlkZW8uYWRkRXZlbnRMaXN0ZW5lcignZHVyYXRpb25jaGFuZ2UnLCB0aGlzLl9vbkR1cmF0aW9uQ2hhbmdlKTtcbiAgICAgICAgdGhpcy5fdmlkZW8uYXVkaW9UcmFja3MuYWRkRXZlbnRMaXN0ZW5lcignYWRkdHJhY2snLCB0aGlzLl9vbkF1ZGlvVHJhY2tBZGRlZC5iaW5kKHRoaXMpICk7XG5cbiAgICAgICAgLy9zZXNzaW9uSWQgKD9wYnM9KSBtYXkgb3IgbWF5IG5vdCBiZSBwYXJ0IG9mIHRoZSB1cmxcbiAgICAgICAgdGhpcy5fc2Vzc2lvbklkID0gdGhpcy5fZ2V0U2Vzc2lvbklkKHVybCk7XG4gICAgICAgIHRoaXMuX2RvbWFpbiA9IHRoaXMuX2dldERvbWFpbih1cmwpO1xuXG4gICAgICAgIHRoaXMuX2Fzc2V0SW5mb1NlcnZpY2UgPSBuZXcgQXNzZXRJbmZvU2VydmljZSh0aGlzLl9wcm90b2NvbCwgdGhpcy5kb21haW4pO1xuXG4gICAgICAgIC8vY2FuJ3QgdXNlICdjb250ZW50LnVwbHluay5jb20nIGFzIGEgZG9tYWluIG5hbWUgYmVjYXVzZSBzZXNzaW9uIGRhdGEgbGl2ZXNcbiAgICAgICAgLy8gaW5zaWRlIGEgc3BlY2lmaWMgZG9tYWluXG4gICAgICAgIGlmKHRoaXMuX2RvbWFpbiAhPT0gJ2NvbnRlbnQudXBseW5rLmNvbScpIHtcbiAgICAgICAgICAgIHRoaXMuX3BpbmdTZXJ2aWNlID0gbmV3IFBpbmdTZXJ2aWNlKHRoaXMuX3Byb3RvY29sLCB0aGlzLmRvbWFpbiwgdGhpcy5fc2Vzc2lvbklkLCB0aGlzLl92aWRlbyk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl91cmwgPSB1cmw7XG4gICAgICAgIHRoaXMuX3ZpZGVvLnNyYyA9IHVybDtcbiAgICAgICAgdGhpcy5fdmlkZW8ubG9hZCgpO1xuICAgIH1cblxuICAgIHB1YmxpYyBkZXN0cm95KCk6IHZvaWQge1xuICAgICAgICB0aGlzLl92aWRlby5zcmMgPSBudWxsO1xuICAgIH1cblxuICAgIHByaXZhdGUgX292ZXJyaWRlQ3VycmVudFRpbWUoKTogdm9pZCB7XG4gICAgICAgIC8vb3ZlcnJpZGUgJ2N1cnJlbnRUaW1lJyBwcm9wZXJ0eSBzbyB3ZSBjYW4gcHJldmVudFxuICAgICAgICAvLyB1c2VycyBmcm9tIHNldHRpbmcgdmlkZW8uY3VycmVudFRpbWUsIGFsbG93aW5nIHRoZW1cbiAgICAgICAgLy8gdG8gc2tpcCBhZHMuXG4gICAgICAgIGNvbnN0IGN1cnJlbnRUaW1lRGVzY3JpcHRvciA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IoSFRNTE1lZGlhRWxlbWVudC5wcm90b3R5cGUsICdjdXJyZW50VGltZScpO1xuICAgICAgICBpZiAoY3VycmVudFRpbWVEZXNjcmlwdG9yKSB7XG4gICAgICAgICAgICBjb25zdCBnZXRDdXJyZW50VGltZSA9IGN1cnJlbnRUaW1lRGVzY3JpcHRvci5nZXQ7XG4gICAgICAgICAgICBjb25zdCBzZXRDdXJyZW50VGltZSA9IGN1cnJlbnRUaW1lRGVzY3JpcHRvci5zZXQ7XG5cbiAgICAgICAgICAgIGxldCBzZWxmID0gdGhpcztcblxuICAgICAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMuX3ZpZGVvLCAnY3VycmVudFRpbWUnLCB7XG4gICAgICAgICAgICAgICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBnZXRDdXJyZW50VGltZS5hcHBseSh0aGlzKTtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHNldDogZnVuY3Rpb24gKHZhbCkge1xuICAgICAgICAgICAgICAgICAgICBpZihzZWxmLmNhblNlZWsoKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2V0Q3VycmVudFRpbWUuYXBwbHkodGhpcywgW3ZhbF0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBlbnVtZXJhYmxlOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBjb25maWd1cmFibGU6IGZhbHNlLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEZXRlcm1pbmVzIGlmIHRoZSBwbGF5ZXIgY2FuIHNlZWsgZ2l2ZW4gaXQncyBjdXJyZW50IHBvc2l0aW9uIGFuZFxuICAgICAqIHdldGhlciBvciBub3QgaXQncyBpbiBhbiBhZCBicmVhay5cbiAgICAgKiBAcmV0dXJuIHtib29sZWFufSBUcnVlIGlmIHRoZSBwbGF5ZXIgY2FuIHNlZWssIG90aGVyd2lzZSBmYWxzZS5cbiAgICAgKi9cbiAgICBjYW5TZWVrKCk6IGJvb2xlYW4ge1xuICAgICAgICBpZiAoIXRoaXMuX2NvbmZpZy5kaXNhYmxlU2Vla0R1cmluZ0FkQnJlYWspIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuICF0aGlzLl9pbkFkQnJlYWs7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfZ2V0U2Vzc2lvbklkKHVybDogc3RyaW5nKTogc3RyaW5nIHtcbiAgICAgICAgLy9odHRwOi8vc3RhY2tvdmVyZmxvdy5jb20vYS81MTU4MzAxXG4gICAgICAgIHZhciBtYXRjaCA9IFJlZ0V4cCgnWz8mXXBicz0oW14mXSopJykuZXhlYyh1cmwpO1xuICAgICAgICByZXR1cm4gbWF0Y2ggJiYgZGVjb2RlVVJJQ29tcG9uZW50KG1hdGNoWzFdLnJlcGxhY2UoL1xcKy9nLCAnICcpKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9nZXREb21haW4odXJsOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgICAgICB2YXIgbGluayA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcbiAgICAgICAgbGluay5zZXRBdHRyaWJ1dGUoJ2hyZWYnLCB1cmwpO1xuXG4gICAgICAgIHJldHVybiBsaW5rLmhvc3RuYW1lO1xuICAgIH1cblxuICAgIHByaXZhdGUgX29uRHVyYXRpb25DaGFuZ2UoKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLl92aWRlby5kdXJhdGlvbiA9PT0gSW5maW5pdHkpIHtcbiAgICAgICAgICAgIHRoaXMuX3BsYXlsaXN0VHlwZSA9ICdMSVZFJztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuX3BsYXlsaXN0VHlwZSA9ICdWT0QnO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCF0aGlzLl9maXJlZFJlYWR5RXZlbnQpIHtcbiAgICAgICAgICAgIHRoaXMuX2ZpcmVkUmVhZHlFdmVudCA9IHRydWU7XG4gICAgICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5SZWFkeSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBzdGF0aWMgZ2V0IEV2ZW50KCkge1xuICAgICAgICByZXR1cm4gRXZlbnRzO1xuICAgIH1cblxuICAgIHB1YmxpYyBzZXRCcm93c2VyKHNhZmFyaTogYm9vbGVhbiwgaWU6IGJvb2xlYW4sIGNocm9tZTogYm9vbGVhbiwgZmlyZWZveDogYm9vbGVhbikge1xuICAgICAgICAvL2RvIG5vdGhpbmdcbiAgICB9XG5cbiAgICBwdWJsaWMgZ2V0VGh1bWJuYWlsKHRpbWU6IG51bWJlciwgc2l6ZTogXCJzbWFsbFwiIHwgXCJsYXJnZVwiKTogdGh1bWIuVGh1bWJuYWlsIHtcbiAgICAgICAgLy9kbyBub3RoaW5nXG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGdldCBhdWRpb1RyYWNrcygpOiBBdWRpb1RyYWNrTGlzdCB7XG4gICAgICAgIHJldHVybiB0aGlzLl92aWRlby5hdWRpb1RyYWNrcztcbiAgICB9XG5cbiAgICBnZXQgYXVkaW9UcmFja0lkKCk6IG51bWJlciB7XG4gICAgICAgIGxldCBjdXJyZW50VHJhY2sgPSB0aGlzLmF1ZGlvVHJhY2s7XG4gICAgICAgIGlmIChjdXJyZW50VHJhY2sgIT0gbnVsbCkge1xuICAgICAgICAgICAgcmV0dXJuIHBhcnNlSW50KGN1cnJlbnRUcmFjay5pZCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIDA7XG5cbiAgICB9XG5cbiAgICBzZXQgYXVkaW9UcmFja0lkKGlkOiBudW1iZXIpIHtcbiAgICAgICAgbGV0IGF1ZGlvVHJhY2tzID0gdGhpcy5hdWRpb1RyYWNrcztcblxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGF1ZGlvVHJhY2tzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBpZiAocGFyc2VJbnQoYXVkaW9UcmFja3NbaV0uaWQpID09PSBpZCkge1xuICAgICAgICAgICAgICAgIGF1ZGlvVHJhY2tzW2ldLmVuYWJsZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldCBhdWRpb1RyYWNrKCk6IEF1ZGlvVHJhY2sge1xuICAgICAgICBsZXQgYXVkaW9UcmFja3MgPSB0aGlzLmF1ZGlvVHJhY2tzO1xuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYXVkaW9UcmFja3MubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGlmIChhdWRpb1RyYWNrc1tpXS5lbmFibGVkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGF1ZGlvVHJhY2tzW2ldO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgZ2V0IGRvbWFpbigpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdGhpcy5fZG9tYWluO1xuICAgIH1cblxuICAgIGdldCBzZXNzaW9uSWQoKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3Nlc3Npb25JZDtcbiAgICB9XG5cbiAgICBnZXQgcGxheWxpc3RUeXBlKCk6IFwiVk9EXCIgfCBcIkVWRU5UXCIgfCBcIkxJVkVcIiB7XG4gICAgICAgIHJldHVybiB0aGlzLl9wbGF5bGlzdFR5cGU7XG4gICAgfVxuXG4gICAgZ2V0IGR1cmF0aW9uKCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLl92aWRlby5kdXJhdGlvbjtcbiAgICB9XG5cbiAgICBnZXQgc3VwcG9ydHNUaHVtYm5haWxzKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgZ2V0IGNsYXNzTmFtZSgpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gJ05hdGl2ZVBsYXllcic7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25JRDNUYWcoZXZlbnQ6IElEM1RhZ0V2ZW50KTogdm9pZCB7XG4gICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLklEM1RhZywgZXZlbnQpO1xuICAgIH1cblxuICAgIHByaXZhdGUgX29uVHh4eElEM0ZyYW1lKGV2ZW50OiBUeHh4SUQzRnJhbWVFdmVudCk6IHZvaWQge1xuICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5UeHh4SUQzRnJhbWUsIGV2ZW50KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vblByaXZJRDNGcmFtZShldmVudDogUHJpdklEM0ZyYW1lRXZlbnQpOiB2b2lkIHtcbiAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuUHJpdklEM0ZyYW1lLCBldmVudCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25UZXh0SUQzRnJhbWUoZXZlbnQ6IFRleHRJRDNGcmFtZUV2ZW50KTogdm9pZCB7XG4gICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLlRleHRJRDNGcmFtZSwgZXZlbnQpO1xuICAgIH1cblxuICAgIHByaXZhdGUgX29uQXVkaW9UcmFja0FkZGVkKGV2ZW50OiBUcmFja0V2ZW50KTogdm9pZCB7XG4gICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLkF1ZGlvVHJhY2tBZGRlZCwgZXZlbnQpO1xuICAgIH1cblxuICAgIHByaXZhdGUgX29uU2xpY2VFbnRlcmVkKGV2ZW50OiBTbGljZUV2ZW50KTogdm9pZCB7XG4gICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLlNsaWNlRW50ZXJlZCwgZXZlbnQpO1xuXG4gICAgICAgIGlmICh0aGlzLl9jdXJyZW50QXNzZXRJZCA9PT0gbnVsbCkge1xuICAgICAgICAgICAgLy9maXJzdCBhc3NldCBpZCBlbmNvdW50ZXJlZFxuICAgICAgICAgICAgdGhpcy5fYXNzZXRJbmZvU2VydmljZS5sb2FkQXNzZXRJZChldmVudC5hc3NldElkLCBudWxsLCAoYXNzZXRJbmZvOiBBc3NldEluZm8pID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLl9jdXJyZW50QXNzZXRJZCA9IGV2ZW50LmFzc2V0SWQ7XG4gICAgICAgICAgICAgICAgdGhpcy5fb25Bc3NldEVuY291bnRlcmVkKGV2ZW50LmN1ZSwgYXNzZXRJbmZvKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuX2N1cnJlbnRBc3NldElkICE9PSBldmVudC5hc3NldElkKSB7XG4gICAgICAgICAgICB0aGlzLl9hc3NldEluZm9TZXJ2aWNlLmxvYWRBc3NldElkKHRoaXMuX2N1cnJlbnRBc3NldElkLCBudWxsLCAoY3VycmVudEFzc2V0SW5mbzogQXNzZXRJbmZvKSA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy5fYXNzZXRJbmZvU2VydmljZS5sb2FkQXNzZXRJZChldmVudC5hc3NldElkLCBudWxsLCAobmV3QXNzZXRJbmZvOiBBc3NldEluZm8pID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fY3VycmVudEFzc2V0SWQgPSBldmVudC5hc3NldElkO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9vbk5ld0Fzc2V0RW5jb3VudGVyZWQoZXZlbnQuY3VlLCBjdXJyZW50QXNzZXRJbmZvLCBuZXdBc3NldEluZm8pO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvL3NhbWUgYXNzZXQgaWQgYXMgcHJldmlvdXMgb25lLCBkbyBub3RoaW5nXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIF9vbkFzc2V0RW5jb3VudGVyZWQoY3VlOiBUZXh0VHJhY2tDdWUsIGFzc2V0SW5mbzogQXNzZXRJbmZvKTogdm9pZCB7XG4gICAgICAgIGxldCBzZWdtZW50OiBTZWdtZW50ID0gdW5kZWZpbmVkO1xuXG4gICAgICAgIGlmIChhc3NldEluZm8uaXNBZCkge1xuICAgICAgICAgICAgc2VnbWVudCA9IHtcbiAgICAgICAgICAgICAgICBpZDogYXNzZXRJbmZvLmFzc2V0LFxuICAgICAgICAgICAgICAgIGluZGV4OiAwLFxuICAgICAgICAgICAgICAgIHN0YXJ0VGltZTogY3VlLnN0YXJ0VGltZSxcbiAgICAgICAgICAgICAgICBlbmRUaW1lOiBjdWUuc3RhcnRUaW1lICsgYXNzZXRJbmZvLmR1cmF0aW9uLFxuICAgICAgICAgICAgICAgIHR5cGU6ICdBRCdcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGxldCBzZWdtZW50czogU2VnbWVudFtdID0gW3NlZ21lbnRdO1xuICAgICAgICAgICAgdGhpcy5fY3VycmVudEFkQnJlYWsgPSBuZXcgQWRCcmVhayhzZWdtZW50cyk7XG4gICAgICAgICAgICB0aGlzLl9pbkFkQnJlYWsgPSB0cnVlO1xuXG4gICAgICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5Bc3NldEVudGVyZWQsIHsgc2VnbWVudDogc2VnbWVudCwgYXNzZXQ6IGFzc2V0SW5mbyB9KTtcbiAgICAgICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLkFkQnJlYWtFbnRlcmVkLCB7IGFkQnJlYWs6IHRoaXMuX2N1cnJlbnRBZEJyZWFrIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5faW5BZEJyZWFrID0gZmFsc2U7XG5cbiAgICAgICAgICAgIC8vZG9uJ3QgaGF2ZSBhIHNlZ21lbnQgdG8gcGFzcyBhbG9uZyBiZWNhdXNlIHdlIGRvbid0IGtub3cgdGhlIGR1cmF0aW9uIG9mIHRoaXMgYXNzZXRcbiAgICAgICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLkFzc2V0RW50ZXJlZCwgeyBzZWdtZW50OiB1bmRlZmluZWQsIGFzc2V0OiBhc3NldEluZm8gfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIF9vbk5ld0Fzc2V0RW5jb3VudGVyZWQoY3VlOiBUZXh0VHJhY2tDdWUsIHByZXZpb3VzQXNzZXQ6IEFzc2V0SW5mbywgbmV3QXNzZXQ6IEFzc2V0SW5mbyk6IHZvaWQge1xuICAgICAgICAvL3dpbGwgd2Ugc3RpbGwgYmUgaW4gYW4gYWQgYnJlYWsgYWZ0ZXIgdGhpcyBhc3NldD9cbiAgICAgICAgdGhpcy5faW5BZEJyZWFrID0gbmV3QXNzZXQuaXNBZDtcblxuICAgICAgICBpZiAocHJldmlvdXNBc3NldC5pc0FkICYmIHRoaXMuX2N1cnJlbnRBZEJyZWFrKSB7XG4gICAgICAgICAgICAvL2xlYXZpbmcgYWQgYnJlYWtcbiAgICAgICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLkFzc2V0RXhpdGVkLCB7IHNlZ21lbnQ6IHRoaXMuX2N1cnJlbnRBZEJyZWFrLmdldFNlZ21lbnRBdCgwKSwgYXNzZXQ6IHByZXZpb3VzQXNzZXQgfSk7XG4gICAgICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5BZEJyZWFrRXhpdGVkLCB7IGFkQnJlYWs6IHRoaXMuX2N1cnJlbnRBZEJyZWFrIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy9kb24ndCBoYXZlIGEgc2VnbWVudCB0byBwYXNzIGFsb25nIGJlY2F1c2Ugd2UgZG9uJ3Qga25vdyB0aGUgZHVyYXRpb24gb2YgdGhpcyBhc3NldFxuICAgICAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuQXNzZXRFeGl0ZWQsIHsgc2VnbWVudDogdW5kZWZpbmVkLCBhc3NldDogcHJldmlvdXNBc3NldCB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX29uQXNzZXRFbmNvdW50ZXJlZChjdWUsIG5ld0Fzc2V0KTtcbiAgICB9XG5cbiAgICBwdWJsaWMgb25UZXh0VHJhY2tDaGFuZ2VkKGNoYW5nZVRyYWNrRXZlbnQ6IFRyYWNrRXZlbnQpOiB2b2lkIHtcbiAgICAgICAgLy9kbyBub3RoaW5nXG4gICAgfVxuXG4gICAgZ2V0IHZlcnNpb24oKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuICcwMi4wMC4xNzEwMTYwMCc7IC8vd2lsbCBiZSBtb2RpZmllZCBieSB0aGUgYnVpbGQgc2NyaXB0XG4gICAgfVxufSIsIlxuLy9wb2x5ZmlsbCBBcnJheS5maW5kKClcbi8vaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvSmF2YVNjcmlwdC9SZWZlcmVuY2UvR2xvYmFsX09iamVjdHMvQXJyYXkvZmluZFxuLy8gaHR0cHM6Ly90YzM5LmdpdGh1Yi5pby9lY21hMjYyLyNzZWMtYXJyYXkucHJvdG90eXBlLmZpbmRcbmlmICghQXJyYXkucHJvdG90eXBlLmZpbmQpIHtcbiAgT2JqZWN0LmRlZmluZVByb3BlcnR5KEFycmF5LnByb3RvdHlwZSwgJ2ZpbmQnLCB7XG4gICAgdmFsdWU6IGZ1bmN0aW9uKHByZWRpY2F0ZTphbnkpIHtcbiAgICAgLy8gMS4gTGV0IE8gYmUgPyBUb09iamVjdCh0aGlzIHZhbHVlKS5cbiAgICAgIGlmICh0aGlzID09IG51bGwpIHtcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignXCJ0aGlzXCIgaXMgbnVsbCBvciBub3QgZGVmaW5lZCcpO1xuICAgICAgfVxuXG4gICAgICB2YXIgbyA9IE9iamVjdCh0aGlzKTtcblxuICAgICAgLy8gMi4gTGV0IGxlbiBiZSA/IFRvTGVuZ3RoKD8gR2V0KE8sIFwibGVuZ3RoXCIpKS5cbiAgICAgIHZhciBsZW4gPSBvLmxlbmd0aCA+Pj4gMDtcblxuICAgICAgLy8gMy4gSWYgSXNDYWxsYWJsZShwcmVkaWNhdGUpIGlzIGZhbHNlLCB0aHJvdyBhIFR5cGVFcnJvciBleGNlcHRpb24uXG4gICAgICBpZiAodHlwZW9mIHByZWRpY2F0ZSAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdwcmVkaWNhdGUgbXVzdCBiZSBhIGZ1bmN0aW9uJyk7XG4gICAgICB9XG5cbiAgICAgIC8vIDQuIElmIHRoaXNBcmcgd2FzIHN1cHBsaWVkLCBsZXQgVCBiZSB0aGlzQXJnOyBlbHNlIGxldCBUIGJlIHVuZGVmaW5lZC5cbiAgICAgIHZhciB0aGlzQXJnID0gYXJndW1lbnRzWzFdO1xuXG4gICAgICAvLyA1LiBMZXQgayBiZSAwLlxuICAgICAgdmFyIGsgPSAwO1xuXG4gICAgICAvLyA2LiBSZXBlYXQsIHdoaWxlIGsgPCBsZW5cbiAgICAgIHdoaWxlIChrIDwgbGVuKSB7XG4gICAgICAgIC8vIGEuIExldCBQayBiZSAhIFRvU3RyaW5nKGspLlxuICAgICAgICAvLyBiLiBMZXQga1ZhbHVlIGJlID8gR2V0KE8sIFBrKS5cbiAgICAgICAgLy8gYy4gTGV0IHRlc3RSZXN1bHQgYmUgVG9Cb29sZWFuKD8gQ2FsbChwcmVkaWNhdGUsIFQsIMKrIGtWYWx1ZSwgaywgTyDCuykpLlxuICAgICAgICAvLyBkLiBJZiB0ZXN0UmVzdWx0IGlzIHRydWUsIHJldHVybiBrVmFsdWUuXG4gICAgICAgIHZhciBrVmFsdWUgPSBvW2tdO1xuICAgICAgICBpZiAocHJlZGljYXRlLmNhbGwodGhpc0FyZywga1ZhbHVlLCBrLCBvKSkge1xuICAgICAgICAgIHJldHVybiBrVmFsdWU7XG4gICAgICAgIH1cbiAgICAgICAgLy8gZS4gSW5jcmVhc2UgayBieSAxLlxuICAgICAgICBrKys7XG4gICAgICB9XG5cbiAgICAgIC8vIDcuIFJldHVybiB1bmRlZmluZWQuXG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgfSk7XG59IiwiXG4vL3BvbHlmaWxsIGZvciBPYmplY3QuYXNzaWduKCkgZm9yIElFMTFcbi8vaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvSmF2YVNjcmlwdC9SZWZlcmVuY2UvR2xvYmFsX09iamVjdHMvT2JqZWN0L2Fzc2lnblxuaWYgKHR5cGVvZiBPYmplY3QuYXNzaWduICE9ICdmdW5jdGlvbicpIHtcbiAgKGZ1bmN0aW9uICgpIHtcbiAgICBPYmplY3QuYXNzaWduID0gZnVuY3Rpb24gKHRhcmdldDogYW55KSB7XG4gICAgICAndXNlIHN0cmljdCc7XG4gICAgICAvLyBXZSBtdXN0IGNoZWNrIGFnYWluc3QgdGhlc2Ugc3BlY2lmaWMgY2FzZXMuXG4gICAgICBpZiAodGFyZ2V0ID09PSB1bmRlZmluZWQgfHwgdGFyZ2V0ID09PSBudWxsKSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0Nhbm5vdCBjb252ZXJ0IHVuZGVmaW5lZCBvciBudWxsIHRvIG9iamVjdCcpO1xuICAgICAgfVxuXG4gICAgICB2YXIgb3V0cHV0ID0gT2JqZWN0KHRhcmdldCk7XG4gICAgICBmb3IgKHZhciBpbmRleCA9IDE7IGluZGV4IDwgYXJndW1lbnRzLmxlbmd0aDsgaW5kZXgrKykge1xuICAgICAgICB2YXIgc291cmNlID0gYXJndW1lbnRzW2luZGV4XTtcbiAgICAgICAgaWYgKHNvdXJjZSAhPT0gdW5kZWZpbmVkICYmIHNvdXJjZSAhPT0gbnVsbCkge1xuICAgICAgICAgIGZvciAodmFyIG5leHRLZXkgaW4gc291cmNlKSB7XG4gICAgICAgICAgICBpZiAoc291cmNlLmhhc093blByb3BlcnR5KG5leHRLZXkpKSB7XG4gICAgICAgICAgICAgIG91dHB1dFtuZXh0S2V5XSA9IHNvdXJjZVtuZXh0S2V5XTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBvdXRwdXQ7XG4gICAgfTtcbiAgfSkoKTtcbn0iLCJcbi8vcG9seWZpbGwgZm9yIFZUVEN1ZSBmb3IgTVMgRWRnZSBhbmQgSUUxMVxuKGZ1bmN0aW9uICgpIHtcbiAgICAoPGFueT53aW5kb3cpLlZUVEN1ZSA9ICg8YW55PndpbmRvdykuVlRUQ3VlIHx8ICg8YW55PndpbmRvdykuVGV4dFRyYWNrQ3VlO1xufSkoKTtcbiIsImltcG9ydCAnLi9wb2x5ZmlsbC92dHQtY3VlJztcbmltcG9ydCAnLi9wb2x5ZmlsbC9vYmplY3QnO1xuaW1wb3J0ICcuL3BvbHlmaWxsL2FycmF5JztcbmltcG9ydCB7IFBsYXllciB9IGZyb20gJy4vcGxheWVyJztcbmltcG9ydCB7IEFkYXB0aXZlUGxheWVyIH0gZnJvbSAnLi9hZGFwdGl2ZS1wbGF5ZXInO1xuaW1wb3J0IHsgTmF0aXZlUGxheWVyIH0gZnJvbSAnLi9uYXRpdmUtcGxheWVyJztcblxuXG5mdW5jdGlvbiBpc05hdGl2ZVBsYXliYWNrU3VwcG9ydGVkKCk6IGJvb2xlYW4ge1xuICAgIHRyeSB7XG4gICAgICAgIGxldCB2aWRlbyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3ZpZGVvJyk7XG5cbiAgICAgICAgaWYgKHZpZGVvLmNhblBsYXlUeXBlKSB7XG4gICAgICAgICAgICByZXR1cm4gdmlkZW8uY2FuUGxheVR5cGUoJ2FwcGxpY2F0aW9uL3ZuZC5hcHBsZS5tcGVndXJsJykgIT09ICcnO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgcmV0dXJuIGZhbHNlO1xufVxuXG5mdW5jdGlvbiBpc0h0bWxQbGF5YmFja1N1cHBvcnRlZCgpOiBib29sZWFuIHtcbiAgICBpZiAoJ01lZGlhU291cmNlJyBpbiB3aW5kb3cgJiYgTWVkaWFTb3VyY2UuaXNUeXBlU3VwcG9ydGVkKSB7XG4gICAgICAgIHJldHVybiBNZWRpYVNvdXJjZS5pc1R5cGVTdXBwb3J0ZWQoJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40MkUwMUUsbXA0YS40MC4yXCInKTtcbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIGN1cnJlbnRTY3JpcHQoKSB7XG4gICAgLy9oYWNreSwgYnV0IHdvcmtzIGZvciBvdXIgbmVlZHNcbiAgICBjb25zdCBzY3JpcHRzID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ3NjcmlwdCcpO1xuICAgIGlmIChzY3JpcHRzICYmIHNjcmlwdHMubGVuZ3RoKSB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc2NyaXB0cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgaWYgKHNjcmlwdHNbaV0uc3JjLmluZGV4T2YoJ3VwbHluay1jb3JlLmpzJykgPiAtMSB8fCBzY3JpcHRzW2ldLnNyYy5pbmRleE9mKCd1cGx5bmstY29yZS5taW4uanMnKSA+IC0xKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNjcmlwdHNbaV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gdW5kZWZpbmVkO1xufVxuXG52YXIgbG9hZGVkVXBseW5rQWRhcHRpdmUgPSB0cnVlO1xuXG5mdW5jdGlvbiBsb2FkVXBseW5rQWRhcHRpdmVQbGF5ZXIodmlkZW86IEhUTUxWaWRlb0VsZW1lbnQsIG9wdGlvbnM/OiBQbGF5ZXJPcHRpb25zLCBjYWxsYmFjaz86IChwbGF5ZXI6IFBsYXllcikgPT4gdm9pZCkge1xuXG4gICAgLy9sb2FkIHVwbHluay1hZGFwdGl2ZS5qc1xuICAgIGxldCB1cmwgPSBjdXJyZW50U2NyaXB0KCkuc3JjLnN1YnN0cmluZygwLCBjdXJyZW50U2NyaXB0KCkuc3JjLmxhc3RJbmRleE9mKCcvJykgKyAxKSArICd1cGx5bmstYWRhcHRpdmUuanMnO1xuXG4gICAgLy8gaWYgdXNpbmcgV2ViQXNzZW1ibHksIHRoZSB3YXNtIGlzIGFscmVhZHkgbG9hZGVkIGZyb20gdGhlIGh0bWxcbiAgICBsZXQgZW5hYmxlV0FTTSA9IGZhbHNlO1xuICAgIGlmIChlbmFibGVXQVNNICYmIHR5cGVvZiBXZWJBc3NlbWJseSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgY2FsbGJhY2sobmV3IEFkYXB0aXZlUGxheWVyKHZpZGVvLCBvcHRpb25zKSk7XG4gICAgfVxuICAgIGVsc2UgaWYgKCFpc1NjcmlwdEFscmVhZHlJbmNsdWRlZCh1cmwpKSB7XG4gICAgICAgIGxvYWRlZFVwbHlua0FkYXB0aXZlID0gZmFsc2U7XG4gICAgICAgIGxvYWRTY3JpcHRBc3luYyh1cmwsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGxvYWRlZFVwbHlua0FkYXB0aXZlID0gdHJ1ZTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG5ldyBBZGFwdGl2ZVBsYXllcih2aWRlbywgb3B0aW9ucykpO1xuICAgICAgICB9KTtcbiAgICB9IGVsc2UgaWYgKGxvYWRlZFVwbHlua0FkYXB0aXZlKSB7XG4gICAgICAgIGNhbGxiYWNrKG5ldyBBZGFwdGl2ZVBsYXllcih2aWRlbywgb3B0aW9ucykpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIC8vc2NyaXB0IGlzIGxvYWRpbmcgc28gd2UnbGwga2VlcCBjaGVja2luZyBpdCdzXG4gICAgICAgIC8vIHN0YXR1cyBiZWZvcmUgZmlyaW5nIHRoZSBjYWxsYmFja1xuICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGxvYWRVcGx5bmtBZGFwdGl2ZVBsYXllcih2aWRlbywgb3B0aW9ucywgY2FsbGJhY2spO1xuICAgICAgICB9LCA1MDApO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gbG9hZFNjcmlwdEFzeW5jKHVybDogc3RyaW5nLCBjYWxsYmFjazogKCkgPT4gdm9pZCk6IHZvaWQge1xuICAgIGxldCBoZWFkID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ2hlYWQnKVswXTtcbiAgICBsZXQgc2NyaXB0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc2NyaXB0Jyk7XG5cbiAgICBzY3JpcHQudHlwZSA9ICd0ZXh0L2phdmFzY3JpcHQnO1xuICAgIHNjcmlwdC5zcmMgPSB1cmw7XG5cbiAgICBzY3JpcHQub25sb2FkID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBjYWxsYmFjaygpO1xuICAgIH07XG5cbiAgICBoZWFkLmFwcGVuZENoaWxkKHNjcmlwdCk7XG59XG5cbmZ1bmN0aW9uIGlzU2NyaXB0QWxyZWFkeUluY2x1ZGVkKHVybDogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgdmFyIHNjcmlwdHMgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZShcInNjcmlwdFwiKTtcbiAgICBpZiAoc2NyaXB0cyAmJiBzY3JpcHRzLmxlbmd0aCkge1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHNjcmlwdHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGlmIChzY3JpcHRzW2ldLnNyYyA9PT0gdXJsKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUFkYXB0aXZlUGxheWVyKHZpZGVvOiBIVE1MVmlkZW9FbGVtZW50LCBvcHRpb25zOiBhbnksIGNhbGxiYWNrPzogKHBsYXllcjogUGxheWVyKSA9PiB2b2lkKSB7XG5cbiAgICBpZiAob3B0aW9ucy5wcmVmZXJOYXRpdmVQbGF5YmFjaykge1xuICAgICAgICBpZiAoaXNOYXRpdmVQbGF5YmFja1N1cHBvcnRlZCgpKSB7XG4gICAgICAgICAgICAvL2NvbnNvbGUubG9nKFwidXNpbmcgbmF0aXZlIHBsYXliYWNrXCIpO1xuICAgICAgICAgICAgY2FsbGJhY2sobmV3IE5hdGl2ZVBsYXllcih2aWRlbywgb3B0aW9ucykpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9IGVsc2UgaWYgKGlzSHRtbFBsYXliYWNrU3VwcG9ydGVkKCkpIHtcbiAgICAgICAgICAgIC8vY29uc29sZS5sb2coXCJmYWxsaW5nIGJhY2sgdG8gdXBseW5rIHBsYXllclwiKTtcbiAgICAgICAgICAgIGxvYWRVcGx5bmtBZGFwdGl2ZVBsYXllcih2aWRlbywgb3B0aW9ucywgY2FsbGJhY2spO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKGlzSHRtbFBsYXliYWNrU3VwcG9ydGVkKCkpIHtcbiAgICAgICAgICAgIC8vY29uc29sZS5sb2coXCJ1c2luZyB1cGx5bmsgcGxheWVyXCIpO1xuICAgICAgICAgICAgbG9hZFVwbHlua0FkYXB0aXZlUGxheWVyKHZpZGVvLCBvcHRpb25zLCBjYWxsYmFjayk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gZWxzZSBpZiAoaXNOYXRpdmVQbGF5YmFja1N1cHBvcnRlZCgpKSB7XG4gICAgICAgICAgICAvL2NvbnNvbGUubG9nKFwiZmFsbGluZyBiYWNrIHRvIG5hdGl2ZSBwbGF5YmFja1wiKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG5ldyBOYXRpdmVQbGF5ZXIodmlkZW8sIG9wdGlvbnMpKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgIH1cbiAgICBjb25zb2xlLndhcm4oXCJubyBwbGF5YmFjayBtb2RlIHN1cHBvcnRlZFwiKTtcbiAgICBjYWxsYmFjayh1bmRlZmluZWQpO1xufVxuXG4oPGFueT53aW5kb3cpLmNyZWF0ZUFkYXB0aXZlUGxheWVyID0gY3JlYXRlQWRhcHRpdmVQbGF5ZXI7XG4oPGFueT53aW5kb3cpLkFkYXB0aXZlUGxheWVyID0gQWRhcHRpdmVQbGF5ZXI7IiwiaW1wb3J0IHsgU3RyaW5nTWFwIH0gZnJvbSAnLi9zdHJpbmctbWFwJztcblxuLy9odHRwOi8vd3d3LmRhdGNobGV5Lm5hbWUvZXM2LWV2ZW50ZW1pdHRlci9cbi8vaHR0cHM6Ly9naXN0LmdpdGh1Yi5jb20vZGF0Y2hsZXkvMzczNTNkNmEyY2I2Mjk2ODdlYjlcbi8vaHR0cDovL2NvZGVwZW4uaW8veXVrdWxlbGUvcGVuL3lOVlZ4Vi8/ZWRpdG9ycz0wMDFcbmV4cG9ydCBjbGFzcyBPYnNlcnZhYmxlIHtcbiAgICBwcml2YXRlIF9saXN0ZW5lcnM6IFN0cmluZ01hcDxhbnk+O1xuXG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHRoaXMuX2xpc3RlbmVycyA9IG5ldyBTdHJpbmdNYXAoKTtcbiAgICB9XG5cbiAgICBvbihsYWJlbDogc3RyaW5nLCBjYWxsYmFjazogYW55KSB7XG4gICAgICAgIHRoaXMuX2xpc3RlbmVycy5oYXMobGFiZWwpIHx8IHRoaXMuX2xpc3RlbmVycy5zZXQobGFiZWwsIFtdKTtcbiAgICAgICAgdGhpcy5fbGlzdGVuZXJzLmdldChsYWJlbCkucHVzaChjYWxsYmFjayk7XG4gICAgfVxuXG4gICAgb2ZmKGxhYmVsOiBzdHJpbmcsIGNhbGxiYWNrOiBhbnkpIHtcbiAgICAgICAgbGV0IGxpc3RlbmVycyA9IHRoaXMuX2xpc3RlbmVycy5nZXQobGFiZWwpO1xuICAgICAgICBsZXQgaW5kZXg6IG51bWJlcjtcblxuICAgICAgICBpZiAobGlzdGVuZXJzICYmIGxpc3RlbmVycy5sZW5ndGgpIHtcbiAgICAgICAgICAgIGluZGV4ID0gbGlzdGVuZXJzLnJlZHVjZSgoaTogbnVtYmVyLCBsaXN0ZW5lcjogYW55LCBpbmRleDogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuICh0aGlzLl9pc0Z1bmN0aW9uKGxpc3RlbmVyKSAmJiBsaXN0ZW5lciA9PT0gY2FsbGJhY2spID8gaSA9IGluZGV4IDogaTtcbiAgICAgICAgICAgIH0sIC0xKTtcblxuICAgICAgICAgICAgaWYgKGluZGV4ID4gLTEpIHtcbiAgICAgICAgICAgICAgICBsaXN0ZW5lcnMuc3BsaWNlKGluZGV4LCAxKTtcbiAgICAgICAgICAgICAgICB0aGlzLl9saXN0ZW5lcnMuc2V0KGxhYmVsLCBsaXN0ZW5lcnMpO1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBmaXJlKGxhYmVsOiBzdHJpbmcsIC4uLmFyZ3M6IGFueVtdKSB7XG4gICAgICAgIGxldCBsaXN0ZW5lcnMgPSB0aGlzLl9saXN0ZW5lcnMuZ2V0KGxhYmVsKTtcblxuICAgICAgICBpZiAobGlzdGVuZXJzICYmIGxpc3RlbmVycy5sZW5ndGgpIHtcbiAgICAgICAgICAgIGxpc3RlbmVycy5mb3JFYWNoKChsaXN0ZW5lcjogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgbGlzdGVuZXIoLi4uYXJncyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9pc0Z1bmN0aW9uKG9iajogYW55KSB7XG4gICAgICAgIHJldHVybiB0eXBlb2Ygb2JqID09ICdmdW5jdGlvbicgfHwgZmFsc2U7XG4gICAgfVxufSIsImltcG9ydCB7IEFkQnJlYWsgfSBmcm9tICcuLi9hZC9hZC1icmVhayc7XG5cbmV4cG9ydCBjbGFzcyBTZWdtZW50TWFwIHtcbiAgICBwcml2YXRlIHJlYWRvbmx5IF9zZWdtZW50czogU2VnbWVudFtdO1xuICAgIHByaXZhdGUgcmVhZG9ubHkgX2FkQnJlYWtzOiBBZEJyZWFrW107XG5cbiAgICBjb25zdHJ1Y3RvcihzZWdtZW50czogU2VnbWVudFtdKSB7XG4gICAgICAgIHRoaXMuX3NlZ21lbnRzID0gc2VnbWVudHM7XG4gICAgICAgIHRoaXMuX2FkQnJlYWtzID0gW107XG4gICAgICAgIHRoaXMuX2luaXRBZGJyZWFrcygpO1xuICAgIH1cblxuICAgIGZpbmRTZWdtZW50KHRpbWU6IG51bWJlcik6IFNlZ21lbnQgfCB1bmRlZmluZWQge1xuICAgICAgICBsZXQgaW5kZXggPSB0aGlzLmdldFNlZ21lbnRJbmRleEF0KHRpbWUpO1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRTZWdtZW50QXQoaW5kZXgpO1xuICAgIH1cblxuICAgIGdldFNlZ21lbnRBdChpbmRleDogbnVtYmVyKTogU2VnbWVudCB7XG4gICAgICAgIGlmIChpbmRleCA+PSAwICYmIGluZGV4IDwgdGhpcy5fc2VnbWVudHMubGVuZ3RoKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fc2VnbWVudHNbaW5kZXhdO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICBnZXRTZWdtZW50SW5kZXhBdCh0aW1lOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX3NlZ21lbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBsZXQgc2VnbWVudCA9IHRoaXMuX3NlZ21lbnRzW2ldO1xuICAgICAgICAgICAgaWYgKHNlZ21lbnQuc3RhcnRUaW1lIDw9IHRpbWUgJiYgdGltZSA8PSBzZWdtZW50LmVuZFRpbWUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gaTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiAtMTtcbiAgICB9XG5cbiAgICBnZXQgbGVuZ3RoKCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLl9zZWdtZW50cy5sZW5ndGg7XG4gICAgfVxuXG4gICAgZ2V0IGFkQnJlYWtzKCk6IEFkQnJlYWtbXSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZEJyZWFrcztcbiAgICB9XG5cbiAgICBnZXQgY29udGVudFNlZ21lbnRzKCk6IFNlZ21lbnRbXSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9zZWdtZW50cy5maWx0ZXIoU2VnbWVudE1hcC5pc0NvbnRlbnQpO1xuICAgIH1cblxuICAgIHN0YXRpYyBpc0FkKHNlZ21lbnQ6IFNlZ21lbnQpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHNlZ21lbnQudHlwZSA9PT0gXCJBRFwiO1xuICAgIH1cblxuICAgIHN0YXRpYyBpc0NvbnRlbnQoc2VnbWVudDogU2VnbWVudCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gc2VnbWVudC50eXBlID09PSBcIkNPTlRFTlRcIjtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9pbml0QWRicmVha3MoKTogdm9pZCB7XG4gICAgICAgIGxldCBhZHM6IFNlZ21lbnRbXSA9IFtdO1xuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fc2VnbWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHdoaWxlIChpIDwgdGhpcy5fc2VnbWVudHMubGVuZ3RoICYmIFNlZ21lbnRNYXAuaXNBZCh0aGlzLl9zZWdtZW50c1tpXSkpIHtcbiAgICAgICAgICAgICAgICBhZHMucHVzaCh0aGlzLl9zZWdtZW50c1tpXSk7XG4gICAgICAgICAgICAgICAgaSsrXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChhZHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgIHRoaXMuX2FkQnJlYWtzLnB1c2gobmV3IEFkQnJlYWsoYWRzKSk7XG4gICAgICAgICAgICAgICAgYWRzID0gW107XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpbkFkQnJlYWsodGltZTogbnVtYmVyKTogYm9vbGVhbiB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fYWRCcmVha3MubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGxldCBhZEJyZWFrID0gdGhpcy5fYWRCcmVha3NbaV07XG4gICAgICAgICAgICBpZiAoYWRCcmVhay5jb250YWlucyh0aW1lKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGdldEFkQnJlYWsodGltZTogbnVtYmVyKTogQWRCcmVhayB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZEJyZWFrcy5maW5kKChhZEJyZWFrOiBBZEJyZWFrKTogYm9vbGVhbiA9PiB7XG4gICAgICAgICAgICByZXR1cm4gYWRCcmVhay5jb250YWlucyh0aW1lKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZ2V0QWRCcmVha3NCZXR3ZWVuKHN0YXJ0OiBudW1iZXIsIGVuZDogbnVtYmVyKTogQWRCcmVha1tdIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkQnJlYWtzLmZpbHRlcigoYWRCcmVhazogQWRCcmVhayk6IGJvb2xlYW4gPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHN0YXJ0IDw9IGFkQnJlYWsuc3RhcnRUaW1lICYmIGFkQnJlYWsuZW5kVGltZSA8PSBlbmQ7XG4gICAgICAgIH0pO1xuICAgIH1cbn0iLCJleHBvcnQgY2xhc3MgU3RyaW5nTWFwPFY+IHtcbiAgICBwcml2YXRlIF9tYXA6IGFueTtcblxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB0aGlzLl9tYXAgPSBuZXcgT2JqZWN0KCk7XG4gICAgfVxuXG4gICAgZ2V0IHNpemUoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIE9iamVjdC5rZXlzKHRoaXMuX21hcCkubGVuZ3RoO1xuICAgIH1cblxuICAgIGhhcyhrZXk6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5fbWFwLmhhc093blByb3BlcnR5KGtleSk7XG4gICAgfVxuXG4gICAgZ2V0KGtleTogc3RyaW5nKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9tYXBba2V5XTtcbiAgICB9XG5cbiAgICBzZXQoa2V5OiBzdHJpbmcsIHZhbHVlOiBWKSB7XG4gICAgICAgIHRoaXMuX21hcFtrZXldID0gdmFsdWU7XG4gICAgfVxuXG4gICAgY2xlYXIoKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyh0aGlzLl9tYXApO1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGtleXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IGtleSA9IGtleXNbaV07XG4gICAgICAgICAgICB0aGlzLl9tYXBba2V5XSA9IG51bGw7XG4gICAgICAgICAgICBkZWxldGUgdGhpcy5fbWFwW2tleV07XG4gICAgICAgIH1cbiAgICB9XG59IiwiaW1wb3J0IHsgdG9IZXhTdHJpbmcgfSBmcm9tICcuL3V0aWxzJztcbmltcG9ydCB7IFRodW1iLCBBc3NldEluZm8sIEFzc2V0SW5mb1NlcnZpY2UgfSBmcm9tICcuLi93ZWItc2VydmljZXMvYXNzZXQtaW5mby1zZXJ2aWNlJztcbmltcG9ydCB7IFNlZ21lbnRNYXAgfSBmcm9tICcuL3NlZ21lbnQtbWFwJztcblxuZXhwb3J0IGludGVyZmFjZSBUaHVtYm5haWwge1xuICAgIHVybDogc3RyaW5nO1xuICAgIGhlaWdodDogbnVtYmVyO1xuICAgIHdpZHRoOiBudW1iZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRUaHVtYm5haWwodGltZTogbnVtYmVyLCBzZWdtZW50czogU2VnbWVudE1hcCwgYXNzZXRJbmZvU2VydmljZTogQXNzZXRJbmZvU2VydmljZSwgdGh1bWJuYWlsU2l6ZTogXCJzbWFsbFwiIHwgXCJsYXJnZVwiID0gXCJzbWFsbFwiKTogVGh1bWJuYWlsIHtcbiAgICBpZiAoaXNOYU4odGltZSkgfHwgdGltZSA8IDApIHtcbiAgICAgICAgdGltZSA9IDA7XG4gICAgfVxuXG4gICAgY29uc3Qgc2VnbWVudCA9IHNlZ21lbnRzLmZpbmRTZWdtZW50KHRpbWUpO1xuICAgIGlmIChzZWdtZW50KSB7XG4gICAgICAgIGNvbnN0IGFzc2V0ID0gYXNzZXRJbmZvU2VydmljZS5nZXRBc3NldEluZm8oc2VnbWVudC5pZCk7XG4gICAgICAgIGlmIChhc3NldCAmJiBhc3NldC50aHVtYnMpIHtcbiAgICAgICAgICAgIGNvbnN0IHNsaWNlTnVtYmVyID0gZ2V0U2xpY2VOdW1iZXIodGltZSwgc2VnbWVudCwgYXNzZXQpO1xuICAgICAgICAgICAgY29uc3QgdGh1bWIgPSBnZXRUaHVtYihhc3NldCwgdGh1bWJuYWlsU2l6ZSk7XG5cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgdXJsOiBnZXRUaHVtYm5haWxVcmwoYXNzZXQsIHNsaWNlTnVtYmVyLCB0aHVtYiksXG4gICAgICAgICAgICAgICAgaGVpZ2h0OiB0aHVtYi5oZWlnaHQsXG4gICAgICAgICAgICAgICAgd2lkdGg6IHRodW1iLndpZHRoXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICB1cmw6ICcnLFxuICAgICAgICBoZWlnaHQ6IDAsXG4gICAgICAgIHdpZHRoOiAwXG4gICAgfTtcbn1cblxuZnVuY3Rpb24gZ2V0VGh1bWJuYWlsVXJsKGFzc2V0OiBBc3NldEluZm8sIHNsaWNlTnVtYmVyOiBudW1iZXIsIHRodW1iOiBUaHVtYik6IHN0cmluZyB7XG4gICAgbGV0IHByZWZpeCA9IGFzc2V0LnRodW1iUHJlZml4O1xuXG4gICAgaWYgKGFzc2V0LnN0b3JhZ2VQYXJ0aXRpb25zICYmIGFzc2V0LnN0b3JhZ2VQYXJ0aXRpb25zLmxlbmd0aCkge1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGFzc2V0LnN0b3JhZ2VQYXJ0aXRpb25zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBwYXJ0aXRpb24gPSBhc3NldC5zdG9yYWdlUGFydGl0aW9uc1tpXTtcbiAgICAgICAgICAgIGlmIChwYXJ0aXRpb24uc3RhcnQgPD0gc2xpY2VOdW1iZXIgJiYgc2xpY2VOdW1iZXIgPCBwYXJ0aXRpb24uZW5kKSB7XG4gICAgICAgICAgICAgICAgcHJlZml4ID0gcGFydGl0aW9uLnVybDtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmIChwcmVmaXhbcHJlZml4Lmxlbmd0aCAtIDFdICE9PSAnLycpIHtcbiAgICAgICAgcHJlZml4ICs9ICcvJztcbiAgICB9XG5cbiAgICBjb25zdCBzbGljZUhleE51bWJlciA9IHRvSGV4U3RyaW5nKHNsaWNlTnVtYmVyKTtcblxuICAgIHJldHVybiBgJHtwcmVmaXh9JHt0aHVtYi5wcmVmaXh9JHtzbGljZUhleE51bWJlcn0uanBnYDtcbn1cblxuZnVuY3Rpb24gZ2V0VGh1bWIoYXNzZXQ6IEFzc2V0SW5mbywgc2l6ZTogJ3NtYWxsJyB8ICdsYXJnZScpOiBUaHVtYiB7XG4gICAgLy9kZWZhdWx0IHRvIHNtYWxsZXN0IHRodW1iXG4gICAgbGV0IHRodW1iOiBUaHVtYiA9IGFzc2V0LnRodW1ic1swXTtcblxuICAgIGlmIChzaXplID09PSBcImxhcmdlXCIpIHtcbiAgICAgICAgLy9sYXN0IHRodW1iIGlzIHRoZSBsYXJnZXN0XG4gICAgICAgIHRodW1iID0gYXNzZXQudGh1bWJzW2Fzc2V0LnRodW1icy5sZW5ndGggLSAxXTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGh1bWI7XG59XG5cblxuZnVuY3Rpb24gZ2V0U2xpY2VOdW1iZXIodGltZTogbnVtYmVyLCBzZWdtZW50OiBTZWdtZW50LCBhc3NldDogQXNzZXRJbmZvKTogbnVtYmVyIHtcbiAgICBsZXQgc2xpY2VOdW1iZXIgPSBNYXRoLmNlaWwoKHRpbWUgLSBzZWdtZW50LnN0YXJ0VGltZSkgLyBhc3NldC5zbGljZUR1cmF0aW9uKTtcbiAgICBzbGljZU51bWJlciArPSBzZWdtZW50LmluZGV4O1xuXG4gICAgaWYgKHNsaWNlTnVtYmVyID4gYXNzZXQubWF4U2xpY2UpIHtcbiAgICAgICAgc2xpY2VOdW1iZXIgPSBhc3NldC5tYXhTbGljZTtcbiAgICB9XG5cbiAgICByZXR1cm4gc2xpY2VOdW1iZXI7XG59XG4iLCJleHBvcnQgZnVuY3Rpb24gdG9UaW1lU3RyaW5nKHRpbWU6IG51bWJlcikge1xuICAgIGlmIChpc05hTih0aW1lKSkge1xuICAgICAgICB0aW1lID0gMDtcbiAgICB9XG5cbiAgICBsZXQgbmVnYXRpdmUgPSAodGltZSA8IDApID8gXCItXCIgOiBcIlwiO1xuXG4gICAgdGltZSA9IE1hdGguYWJzKHRpbWUpO1xuXG4gICAgbGV0IHNlY29uZHMgPSAodGltZSAlIDYwKSB8IDA7XG4gICAgbGV0IG1pbnV0ZXMgPSAoKHRpbWUgLyA2MCkgJSA2MCkgfCAwO1xuICAgIGxldCBob3VycyA9ICgoKHRpbWUgLyA2MCkgLyA2MCkgJSA2MCkgfCAwO1xuICAgIGxldCBzaG93SG91cnMgPSBob3VycyA+IDA7XG5cbiAgICBsZXQgaHJTdHIgPSBob3VycyA8IDEwID8gYDAke2hvdXJzfWAgOiBgJHtob3Vyc31gO1xuICAgIGxldCBtaW5TdHIgPSBtaW51dGVzIDwgMTAgPyBgMCR7bWludXRlc31gIDogYCR7bWludXRlc31gO1xuICAgIGxldCBzZWNTdHIgPSBzZWNvbmRzIDwgMTAgPyBgMCR7c2Vjb25kc31gIDogYCR7c2Vjb25kc31gO1xuXG4gICAgaWYgKHNob3dIb3Vycykge1xuICAgICAgICByZXR1cm4gYCR7bmVnYXRpdmV9JHtoclN0cn06JHttaW5TdHJ9OiR7c2VjU3RyfWA7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGAke25lZ2F0aXZlfSR7bWluU3RyfToke3NlY1N0cn1gO1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvSGV4U3RyaW5nKG51bWJlcjogbnVtYmVyLCBtaW5MZW5ndGggPSA4KTogc3RyaW5nIHtcbiAgICBsZXQgaGV4ID0gbnVtYmVyLnRvU3RyaW5nKDE2KS50b1VwcGVyQ2FzZSgpO1xuICAgIHdoaWxlIChoZXgubGVuZ3RoIDwgbWluTGVuZ3RoKSB7XG4gICAgICAgIGhleCA9IFwiMFwiICsgaGV4O1xuICAgIH1cblxuICAgIHJldHVybiBoZXg7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBiYXNlNjRUb0J1ZmZlcihiNjRlbmNvZGVkOiBzdHJpbmcpOiBVaW50OEFycmF5IHtcbiAgICByZXR1cm4gbmV3IFVpbnQ4QXJyYXkoYXRvYihiNjRlbmNvZGVkKS5zcGxpdChcIlwiKS5tYXAoZnVuY3Rpb24gKGMpIHsgcmV0dXJuIGMuY2hhckNvZGVBdCgwKTsgfSkpXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzbGljZShkYXRhOiBVaW50OEFycmF5LCBzdGFydDogbnVtYmVyLCBlbmQ/OiBudW1iZXIpOiBVaW50OEFycmF5IHtcbiAgICAvL0lFIDExIGRvZXNuJ3Qgc3VwcG9ydCBzbGljZSgpIG9uIFR5cGVkQXJyYXkgb2JqZWN0c1xuICAgIGlmIChkYXRhLnNsaWNlKSB7XG4gICAgICAgIHJldHVybiBkYXRhLnNsaWNlKHN0YXJ0LCBlbmQpO1xuICAgIH1cblxuICAgIGlmIChlbmQpIHtcbiAgICAgICAgcmV0dXJuIGRhdGEuc3ViYXJyYXkoc3RhcnQsIGVuZCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGRhdGEuc3ViYXJyYXkoc3RhcnQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNMb2NhbFN0b3JhZ2VBdmFpbGFibGUoKVxue1xuICAgIC8vIENvcGllZCBmcm9tIFBseXIgY29kZVxuICAgIGlmICghKCdsb2NhbFN0b3JhZ2UnIGluIHdpbmRvdykpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIC8vIFRyeSB0byB1c2UgaXQgKGl0IG1pZ2h0IGJlIGRpc2FibGVkLCBlLmcuIHVzZXIgaXMgaW4gcHJpdmF0ZSBtb2RlKVxuICAgIC8vIHNlZTogaHR0cHM6Ly9naXRodWIuY29tL1NlbHovcGx5ci9pc3N1ZXMvMTMxXG4gICAgdHJ5IHtcbiAgICAgICAgLy8gQWRkIHRlc3QgaXRlbVxuICAgICAgICB3aW5kb3cubG9jYWxTdG9yYWdlLnNldEl0ZW0oJ19fX3Rlc3QnLCAnT0snKTtcblxuICAgICAgICAvLyBHZXQgdGhlIHRlc3QgaXRlbVxuICAgICAgICB2YXIgcmVzdWx0ID0gd2luZG93LmxvY2FsU3RvcmFnZS5nZXRJdGVtKCdfX190ZXN0Jyk7XG5cbiAgICAgICAgLy8gQ2xlYW4gdXBcbiAgICAgICAgd2luZG93LmxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKCdfX190ZXN0Jyk7XG5cbiAgICAgICAgLy8gQ2hlY2sgaWYgdmFsdWUgbWF0Y2hlc1xuICAgICAgICByZXR1cm4gKHJlc3VsdCA9PT0gJ09LJyk7XG4gICAgfVxuICAgIGNhdGNoIChlKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRQcm90b2NvbCh1cmw6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgdHJ5IHtcbiAgICAgICAgLy9ub3QgYWxsIGJyb3dzZXJzIHN1cHBvcnQgVVJMIGFwaSAoSUUxMS4uLilcbiAgICAgICAgcmV0dXJuIG5ldyBVUkwodXJsKS5wcm90b2NvbDtcbiAgICB9IGNhdGNoIChfKSB7IH1cblxuICAgIHZhciBsaW5rID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpO1xuICAgIGxpbmsuc2V0QXR0cmlidXRlKCdocmVmJywgdXJsKTtcblxuICAgIHJldHVybiBsaW5rLnByb3RvY29sO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNJRTExT3JFZGdlKCk6IGJvb2xlYW4ge1xuICAgIGxldCBpc0lFMTEgPSAobmF2aWdhdG9yLmFwcFZlcnNpb24uaW5kZXhPZignV2luZG93cyBOVCcpICE9PSAtMSkgJiYgKG5hdmlnYXRvci5hcHBWZXJzaW9uLmluZGV4T2YoJ3J2OjExJykgIT09IC0xKTtcbiAgICBsZXQgaXNFZGdlID0gbmF2aWdhdG9yLmFwcFZlcnNpb24uaW5kZXhPZignRWRnZScpICE9PSAtMTtcbiAgICByZXR1cm4gaXNJRTExIHx8IGlzRWRnZTtcbn0iLCJpbXBvcnQgeyBTZWdtZW50TWFwIH0gZnJvbSAnLi4vdXRpbHMvc2VnbWVudC1tYXAnO1xuaW1wb3J0IHsgU3RyaW5nTWFwIH0gZnJvbSAnLi4vdXRpbHMvc3RyaW5nLW1hcCc7XG5cbmNvbnN0IGVudW0gVHZSYXRpbmcge1xuICAgIE5vdEF2YWlsYWJsZSA9IC0xLFxuICAgIE5vdEFwcGxpY2FibGUgPSAwLFxuICAgIFRWX1kgPSAxLFxuICAgIFRWX1k3ID0gMixcbiAgICBUVl9HID0gMyxcbiAgICBUVl9QRyA9IDQsXG4gICAgVFZfMTQgPSA1LFxuICAgIFRWX01BID0gNixcbiAgICBOb3RSYXRlZCA9IDdcbn1cblxuY29uc3QgZW51bSBNb3ZpZVJhdGluZyB7XG4gICAgTm90QXZhaWxhYmxlID0gLTEsXG4gICAgTm90QXBwbGljYWJsZSA9IDAsXG4gICAgRyA9IDEsXG4gICAgUEcgPSAyLFxuICAgIFBHXzEzID0gMyxcbiAgICBSID0gNCxcbiAgICBOQ18xNyA9IDUsXG4gICAgWCA9IDYsXG4gICAgTm90UmF0ZWQgPSA3XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVGh1bWIge1xuICAgIHdpZHRoOiBudW1iZXI7XG4gICAgcHJlZml4OiBzdHJpbmc7XG4gICAgaGVpZ2h0OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RvcmFnZVBhcml0aW9uIHtcbiAgICAvKipcbiAgICAgKiBTdGFydGluZyBzbGljZSBudW1iZXIsIGluY2x1c2l2ZVxuICAgICAqL1xuICAgIHN0YXJ0OiBudW1iZXI7XG5cbiAgICAvKipcbiAgICAgKiBFbmRpbmcgc2xpY2UgbnVtYmVyLCBleGNsdXNpdmVcbiAgICAgKi9cbiAgICBlbmQ6IG51bWJlcjtcbiAgICB1cmw6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIEFzc2V0SW5mb1NlcmlhbGl6ZWQge1xuICAgIGF1ZGlvX29ubHk6IG51bWJlcjtcbiAgICBlcnJvcjogbnVtYmVyO1xuICAgIHR2X3JhdGluZzogbnVtYmVyO1xuICAgIHN0b3JhZ2VfcGFydGl0aW9uczogU3RvcmFnZVBhcml0aW9uW107XG4gICAgbWF4X3NsaWNlOiBudW1iZXI7XG4gICAgdGh1bWJfcHJlZml4OiBzdHJpbmc7XG4gICAgYWRfZGF0YTogT2JqZWN0O1xuICAgIHNsaWNlX2R1cjogbnVtYmVyO1xuICAgIG1vdmllX3JhdGluZzogbnVtYmVyO1xuICAgIG93bmVyOiBzdHJpbmc7XG4gICAgcmF0ZXM6IG51bWJlcltdO1xuICAgIHRodW1iczogVGh1bWJbXTtcbiAgICBwb3N0ZXJfdXJsOiBzdHJpbmc7XG4gICAgZHVyYXRpb246IG51bWJlcjtcbiAgICBkZWZhdWx0X3Bvc3Rlcl91cmw6IHN0cmluZztcbiAgICBkZXNjOiBzdHJpbmc7XG4gICAgcmF0aW5nX2ZsYWdzOiBudW1iZXI7XG4gICAgZXh0ZXJuYWxfaWQ6IHN0cmluZztcbiAgICBpc19hZDogbnVtYmVyO1xuICAgIGFzc2V0OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBBZERhdGEge1xuICAgIGNsaWNrPzogc3RyaW5nW107XG59XG5cbmV4cG9ydCBjbGFzcyBBc3NldEluZm8ge1xuICAgIHJlYWRvbmx5IGF1ZGlvT25seTogYm9vbGVhbjtcbiAgICByZWFkb25seSBlcnJvcjogYm9vbGVhbjtcbiAgICByZWFkb25seSB0dlJhdGluZzogVHZSYXRpbmc7XG4gICAgcmVhZG9ubHkgc3RvcmFnZVBhcnRpdGlvbnM6IFN0b3JhZ2VQYXJpdGlvbltdO1xuICAgIHJlYWRvbmx5IG1heFNsaWNlOiBudW1iZXI7XG4gICAgcmVhZG9ubHkgdGh1bWJQcmVmaXg6IHN0cmluZztcbiAgICByZWFkb25seSBhZERhdGE6IEFkRGF0YTtcbiAgICByZWFkb25seSBzbGljZUR1cmF0aW9uOiBudW1iZXI7XG4gICAgcmVhZG9ubHkgbW92aWVSYXRpbmc6IE1vdmllUmF0aW5nO1xuICAgIHJlYWRvbmx5IG93bmVyOiBzdHJpbmc7XG4gICAgcmVhZG9ubHkgcmF0ZXM6IG51bWJlcltdO1xuICAgIHJlYWRvbmx5IHRodW1iczogVGh1bWJbXTtcbiAgICByZWFkb25seSBwb3N0ZXJVcmw6IHN0cmluZztcbiAgICByZWFkb25seSBkdXJhdGlvbjogbnVtYmVyO1xuICAgIHJlYWRvbmx5IGRlZmF1bHRQb3N0ZXJVcmw6IHN0cmluZztcbiAgICByZWFkb25seSBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICAgIHJlYWRvbmx5IHJhdGluZ0ZsYWdzOiBudW1iZXI7XG4gICAgcmVhZG9ubHkgZXh0ZXJuYWxJZDogc3RyaW5nO1xuICAgIHJlYWRvbmx5IGlzQWQ6IGJvb2xlYW47XG4gICAgcmVhZG9ubHkgYXNzZXQ6IHN0cmluZztcblxuICAgIGNvbnN0cnVjdG9yKG9iajogQXNzZXRJbmZvU2VyaWFsaXplZCwgaXNBZDogYm9vbGVhbiB8IG51bGwpIHtcbiAgICAgICAgdGhpcy5hdWRpb09ubHkgPSBvYmouYXVkaW9fb25seSA9PSAxO1xuICAgICAgICB0aGlzLmVycm9yID0gb2JqLmVycm9yID09IDE7XG4gICAgICAgIHRoaXMudHZSYXRpbmcgPSBvYmoudHZfcmF0aW5nO1xuICAgICAgICB0aGlzLnN0b3JhZ2VQYXJ0aXRpb25zID0gb2JqLnN0b3JhZ2VfcGFydGl0aW9ucztcbiAgICAgICAgdGhpcy5tYXhTbGljZSA9IG9iai5tYXhfc2xpY2U7XG4gICAgICAgIHRoaXMudGh1bWJQcmVmaXggPSBvYmoudGh1bWJfcHJlZml4O1xuICAgICAgICB0aGlzLmFkRGF0YSA9IG9iai5hZF9kYXRhO1xuICAgICAgICB0aGlzLnNsaWNlRHVyYXRpb24gPSBvYmouc2xpY2VfZHVyO1xuICAgICAgICB0aGlzLm1vdmllUmF0aW5nID0gb2JqLm1vdmllX3JhdGluZztcbiAgICAgICAgdGhpcy5vd25lciA9IG9iai5vd25lcjtcbiAgICAgICAgdGhpcy5yYXRlcyA9IG9iai5yYXRlcztcbiAgICAgICAgdGhpcy50aHVtYnMgPSBvYmoudGh1bWJzO1xuICAgICAgICB0aGlzLnBvc3RlclVybCA9IG9iai5wb3N0ZXJfdXJsO1xuICAgICAgICB0aGlzLmR1cmF0aW9uID0gb2JqLmR1cmF0aW9uO1xuICAgICAgICB0aGlzLmRlZmF1bHRQb3N0ZXJVcmwgPSBvYmouZGVmYXVsdF9wb3N0ZXJfdXJsO1xuICAgICAgICB0aGlzLmRlc2NyaXB0aW9uID0gb2JqLmRlc2M7XG4gICAgICAgIHRoaXMucmF0aW5nRmxhZ3MgPSBvYmoucmF0aW5nX2ZsYWdzO1xuICAgICAgICB0aGlzLmV4dGVybmFsSWQgPSBvYmouZXh0ZXJuYWxfaWQ7XG4gICAgICAgIHRoaXMuYXNzZXQgPSBvYmouYXNzZXQ7XG5cbiAgICAgICAgLy91c2UgdmFsdWUgZnJvbSBTZWdtZW50TWFwIGlmIGF2YWlsYWJsZSAoIzExOCwgVVAtNDM1NClcbiAgICAgICAgaWYgKGlzQWQgPT0gbnVsbCkge1xuICAgICAgICAgICAgdGhpcy5pc0FkID0gb2JqLmlzX2FkID09PSAxO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5pc0FkID0gaXNBZDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vc29ydCB0aHVtYnMgYnkgaW1hZ2Ugd2lkdGgsIHNtYWxsZXN0IHRvIGxhcmdlc3RcbiAgICAgICAgLy8gdGh1bWJzIG1heSBiZSB1bmRlZmluZWQgd2hlbiBwbGF5aW5nIGFuIGF1ZGlvLW9ubHkgYXNzZXRcbiAgICAgICAgaWYgKHRoaXMudGh1bWJzKSB7XG4gICAgICAgICAgICB0aGlzLnRodW1icy5zb3J0KGZ1bmN0aW9uIChsZWZ0OiBUaHVtYiwgcmlnaHQ6IFRodW1iKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGxlZnQud2lkdGggLSByaWdodC53aWR0aDtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy9jbGFtcCBzdG9yYWdlIHBhcnRpdGlvbiBzbGljZSBlbmQgbnVtYmVycyBhcyB0aGV5IGNhbiBiZSBsYXJnZXIgdGhhblxuICAgICAgICAvLyBqYXZhc2NyaXB0IGNhbiBzYWZlbHkgcmVwcmVzZW50XG4gICAgICAgIGlmICh0aGlzLnN0b3JhZ2VQYXJ0aXRpb25zICYmIHRoaXMuc3RvcmFnZVBhcnRpdGlvbnMubGVuZ3RoKSB7XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuc3RvcmFnZVBhcnRpdGlvbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAvL051bWJlci5NQVhfU0FGRV9JTlRFR0VSID09PSA5MDA3MTk5MjU0NzQwOTkxXG4gICAgICAgICAgICAgICAgLy9OdW1iZXIuTUFYX1NBRkVfSU5URUdFUiBub3Qgc3VwcG9ydGVkIGluIElFXG4gICAgICAgICAgICAgICAgdGhpcy5zdG9yYWdlUGFydGl0aW9uc1tpXS5lbmQgPSBNYXRoLm1pbih0aGlzLnN0b3JhZ2VQYXJ0aXRpb25zW2ldLmVuZCwgOTAwNzE5OTI1NDc0MDk5MSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmV4cG9ydCBjbGFzcyBBc3NldEluZm9TZXJ2aWNlIHtcbiAgICBwcml2YXRlIHJlYWRvbmx5IF9wcm90b2NvbDogc3RyaW5nO1xuICAgIHByaXZhdGUgcmVhZG9ubHkgX2RvbWFpbjogc3RyaW5nO1xuICAgIHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25JZDogc3RyaW5nO1xuICAgIHByaXZhdGUgcmVhZG9ubHkgX2NhY2hlOiBTdHJpbmdNYXA8QXNzZXRJbmZvPjtcblxuICAgIGNvbnN0cnVjdG9yKHByb3RvY29sOiBzdHJpbmcsIGRvbWFpbjogc3RyaW5nLCBzZXNzaW9uSWQ/OiBzdHJpbmcpIHtcbiAgICAgICAgdGhpcy5fcHJvdG9jb2wgPSBwcm90b2NvbDtcbiAgICAgICAgdGhpcy5fZG9tYWluID0gZG9tYWluO1xuICAgICAgICB0aGlzLl9zZXNzaW9uSWQgPSBzZXNzaW9uSWQ7XG4gICAgICAgIHRoaXMuX2NhY2hlID0gbmV3IFN0cmluZ01hcDxBc3NldEluZm8+KCk7XG5cbiAgICAgICAgdGhpcy5fbG9hZFNlZ21lbnRzID0gdGhpcy5fbG9hZFNlZ21lbnRzLmJpbmQodGhpcyk7XG4gICAgfVxuXG4gICAgbG9hZFNlZ21lbnRNYXAoc2VnbWVudE1hcDogU2VnbWVudE1hcCwgY2FsbGJhY2s6ICgpID0+IHZvaWQpOiB2b2lkIHtcbiAgICAgICAgbGV0IHNlZ21lbnRzOiBTZWdtZW50W10gPSBbXTtcblxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHNlZ21lbnRNYXAubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGxldCBzZWdtZW50ID0gc2VnbWVudE1hcC5nZXRTZWdtZW50QXQoaSk7XG4gICAgICAgICAgICBzZWdtZW50cy5wdXNoKHNlZ21lbnQpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fbG9hZFNlZ21lbnRzKHNlZ21lbnRzLCBjYWxsYmFjayk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfbG9hZFNlZ21lbnRzKHNlZ21lbnRzOiBTZWdtZW50W10sIGNhbGxiYWNrOiAoKSA9PiB2b2lkKTogdm9pZCB7XG4gICAgICAgIGlmIChzZWdtZW50cy5sZW5ndGggPT0gMCkge1xuICAgICAgICAgICAgY2FsbGJhY2soKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBzZWdtZW50ID0gc2VnbWVudHMuc2hpZnQoKTtcbiAgICAgICAgdGhpcy5sb2FkU2VnbWVudChzZWdtZW50LCAoKSA9PiB7XG4gICAgICAgICAgICB0aGlzLl9sb2FkU2VnbWVudHMoc2VnbWVudHMsIGNhbGxiYWNrKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy9sb2FkKGFzc2V0SWQ6IHN0cmluZywgY2FsbEJhY2s6IChhc3NldEluZm86IEFzc2V0SW5mbykgPT4gdm9pZCk6IHZvaWQge1xuICAgIGxvYWRBc3NldElkKGFzc2V0SWQ6IHN0cmluZywgaXNBZDogYm9vbGVhbiB8IG51bGwsIGNhbGxCYWNrOiAoYXNzZXRJbmZvOiBBc3NldEluZm8pID0+IHZvaWQpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuaXNMb2FkZWQoYXNzZXRJZCkpIHtcbiAgICAgICAgICAgIC8vYXNzZXRJbmZvIGZvciBhc3NldElkIGlzIGFscmVhZHkgbG9hZGVkXG4gICAgICAgICAgICBsZXQgaW5mbyA9IHRoaXMuX2NhY2hlLmdldChhc3NldElkKTtcbiAgICAgICAgICAgIGNhbGxCYWNrKGluZm8pO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IHVybCA9IGAke3RoaXMuX3Byb3RvY29sfS8vJHt0aGlzLl9kb21haW59L3BsYXllci9hc3NldGluZm8vJHthc3NldElkfS5qc29uYDtcblxuICAgICAgICBpZiAodGhpcy5fc2Vzc2lvbklkICYmIHRoaXMuX3Nlc3Npb25JZCAhPSBcIlwiKSB7XG4gICAgICAgICAgICB1cmwgPSBgJHt1cmx9P3Bicz0ke3RoaXMuX3Nlc3Npb25JZH1gO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHhociA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xuICAgICAgICB4aHIub25sb2FkZW5kID0gKCk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgaWYgKHhoci5zdGF0dXMgPT0gMjAwKSB7XG4gICAgICAgICAgICAgICAgbGV0IG9iaiA9IEpTT04ucGFyc2UoeGhyLnJlc3BvbnNlVGV4dCk7XG4gICAgICAgICAgICAgICAgbGV0IGFzc2V0SW5mbyA9IG5ldyBBc3NldEluZm8ob2JqLCBpc0FkKTtcblxuICAgICAgICAgICAgICAgIC8vYWRkIGFzc2V0SW5mbyB0byBjYWNoZVxuICAgICAgICAgICAgICAgIHRoaXMuX2NhY2hlLnNldChhc3NldElkLCBhc3NldEluZm8pO1xuXG4gICAgICAgICAgICAgICAgY2FsbEJhY2soYXNzZXRJbmZvKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY2FsbEJhY2sobnVsbCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgeGhyLm9wZW4oXCJHRVRcIiwgdXJsKTtcbiAgICAgICAgeGhyLnNlbmQoKTtcbiAgICB9XG5cbiAgICBsb2FkU2VnbWVudChzZWdtZW50OiBTZWdtZW50LCBjYWxsQmFjazogKGFzc2V0SW5mbzogQXNzZXRJbmZvKSA9PiB2b2lkKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGFzc2V0SWQ6IHN0cmluZyA9IHNlZ21lbnQuaWQ7XG4gICAgICAgIGNvbnN0IGlzQWQgPSBTZWdtZW50TWFwLmlzQWQoc2VnbWVudCk7XG5cbiAgICAgICAgdGhpcy5sb2FkQXNzZXRJZChhc3NldElkLCBpc0FkLCBjYWxsQmFjayk7XG4gICAgfVxuXG4gICAgaXNMb2FkZWQoYXNzZXRJZDogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLl9jYWNoZS5oYXMoYXNzZXRJZCk7XG4gICAgfVxuXG4gICAgZ2V0QXNzZXRJbmZvKGFzc2V0SWQ6IHN0cmluZyk6IEFzc2V0SW5mbyB7XG4gICAgICAgIGlmICh0aGlzLmlzTG9hZGVkKGFzc2V0SWQpKSB7XG4gICAgICAgICAgICBsZXQgaW5mbyA9IHRoaXMuX2NhY2hlLmdldChhc3NldElkKTtcbiAgICAgICAgICAgIHJldHVybiBpbmZvO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICBjbGVhcigpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5fY2FjaGUuY2xlYXIoKTtcbiAgICB9XG59XG4iLCJleHBvcnQgY2xhc3MgUGluZ1NlcnZpY2Uge1xuICAgIHByaXZhdGUgcmVhZG9ubHkgX3Byb3RvY29sOiBzdHJpbmc7XG4gICAgcHJpdmF0ZSByZWFkb25seSBfZG9tYWluOiBzdHJpbmc7XG4gICAgcHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbklkOiBzdHJpbmc7XG4gICAgcHJpdmF0ZSByZWFkb25seSBfdmlkZW86IEhUTUxWaWRlb0VsZW1lbnQ7XG5cbiAgICBwcml2YXRlIF9waW5nU2VydmVyOiBib29sZWFuO1xuICAgIHByaXZhdGUgX3NlbnRTdGFydFBpbmc6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSBfc2Vla2luZzogYm9vbGVhbjtcblxuICAgIHByaXZhdGUgX2N1cnJlbnRUaW1lOiBudW1iZXI7XG4gICAgcHJpdmF0ZSBfc2Vla0Zyb21UaW1lOiBudW1iZXI7XG4gICAgcHJpdmF0ZSBfbmV4dFRpbWU6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuICAgIHByaXZhdGUgcmVhZG9ubHkgU1RBUlQgPSBcInN0YXJ0XCI7XG4gICAgcHJpdmF0ZSByZWFkb25seSBTRUVLID0gXCJzZWVrXCI7XG5cbiAgICBjb25zdHJ1Y3Rvcihwcm90b2NvbDogc3RyaW5nLCBkb21haW46IHN0cmluZywgc2Vzc2lvbklkOiBzdHJpbmcsIHZpZGVvOiBIVE1MVmlkZW9FbGVtZW50KSB7XG5cbiAgICAgICAgdGhpcy5fcHJvdG9jb2wgPSBwcm90b2NvbDtcbiAgICAgICAgdGhpcy5fZG9tYWluID0gZG9tYWluO1xuICAgICAgICB0aGlzLl9zZXNzaW9uSWQgPSBzZXNzaW9uSWQ7XG4gICAgICAgIHRoaXMuX3ZpZGVvID0gdmlkZW87XG5cbiAgICAgICAgdGhpcy5fcGluZ1NlcnZlciA9IHNlc3Npb25JZCAhPSBudWxsICYmIHNlc3Npb25JZCAhPSBcIlwiO1xuICAgICAgICB0aGlzLl9uZXh0VGltZSA9IHVuZGVmaW5lZDtcblxuICAgICAgICB0aGlzLl9zZW50U3RhcnRQaW5nID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX3NlZWtpbmcgPSBmYWxzZTtcblxuICAgICAgICB0aGlzLl9jdXJyZW50VGltZSA9IDAuMDtcbiAgICAgICAgdGhpcy5fc2Vla0Zyb21UaW1lID0gMC4wO1xuXG4gICAgICAgIHRoaXMuX3ZpZGVvID0gdmlkZW87XG5cbiAgICAgICAgdGhpcy5fb25QbGF5ZXJQb3NpdGlvbkNoYW5nZWQgPSB0aGlzLl9vblBsYXllclBvc2l0aW9uQ2hhbmdlZC5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLl9vblN0YXJ0ID0gdGhpcy5fb25TdGFydC5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLl9vblNlZWtlZCA9IHRoaXMuX29uU2Vla2VkLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuX29uU2Vla2luZyA9IHRoaXMuX29uU2Vla2luZy5iaW5kKHRoaXMpO1xuXG4gICAgICAgIGlmICh0aGlzLl9waW5nU2VydmVyKSB7XG4gICAgICAgICAgICB0aGlzLl92aWRlby5hZGRFdmVudExpc3RlbmVyKCd0aW1ldXBkYXRlJywgdGhpcy5fb25QbGF5ZXJQb3NpdGlvbkNoYW5nZWQpO1xuICAgICAgICAgICAgdGhpcy5fdmlkZW8uYWRkRXZlbnRMaXN0ZW5lcigncGxheWluZycsIHRoaXMuX29uU3RhcnQpO1xuICAgICAgICAgICAgdGhpcy5fdmlkZW8uYWRkRXZlbnRMaXN0ZW5lcignc2Vla2VkJywgdGhpcy5fb25TZWVrZWQpO1xuICAgICAgICAgICAgdGhpcy5fdmlkZW8uYWRkRXZlbnRMaXN0ZW5lcignc2Vla2luZycsIHRoaXMuX29uU2Vla2luZyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIF9jcmVhdGVRdWVyeVN0cmluZyhldmVudDogc3RyaW5nLCBjdXJyZW50UG9zaXRpb246IG51bWJlciwgZnJvbVBvc2l0aW9uPzogbnVtYmVyKSB7XG4gICAgICAgIGNvbnN0IFZFUlNJT04gPSAzO1xuXG4gICAgICAgIGlmIChldmVudCkge1xuICAgICAgICAgICAgbGV0IHN0ciA9IGB2PSR7VkVSU0lPTn0mZXY9JHtldmVudH0mcHQ9JHtjdXJyZW50UG9zaXRpb259YDtcblxuICAgICAgICAgICAgaWYgKGZyb21Qb3NpdGlvbikge1xuICAgICAgICAgICAgICAgIHN0ciArPSBgJmZ0PSR7ZnJvbVBvc2l0aW9ufWA7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBzdHI7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gYHY9JHtWRVJTSU9OfSZwdD0ke2N1cnJlbnRQb3NpdGlvbn1gO1xuICAgIH1cblxuICAgIHByaXZhdGUgX29uU3RhcnQoKSB7XG4gICAgICAgIGlmICh0aGlzLl9waW5nU2VydmVyICYmICF0aGlzLl9zZW50U3RhcnRQaW5nKSB7XG4gICAgICAgICAgICB0aGlzLl9zZW5kUGluZyh0aGlzLlNUQVJULCAwKTtcbiAgICAgICAgICAgIHRoaXMuX3NlbnRTdGFydFBpbmcgPSB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25TZWVraW5nKCkge1xuICAgICAgICB0aGlzLl9zZWVraW5nID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5fbmV4dFRpbWUgPSB1bmRlZmluZWQ7XG4gICAgICAgIHRoaXMuX3NlZWtGcm9tVGltZSA9IHRoaXMuX2N1cnJlbnRUaW1lO1xuICAgIH1cblxuICAgIHByaXZhdGUgX29uU2Vla2VkKCkge1xuICAgICAgICBpZiAodGhpcy5fcGluZ1NlcnZlciAmJiB0aGlzLl9zZWVraW5nICYmIHRoaXMuX3NlZWtGcm9tVGltZSkge1xuICAgICAgICAgICAgdGhpcy5fc2VuZFBpbmcodGhpcy5TRUVLLCB0aGlzLl9jdXJyZW50VGltZSwgdGhpcy5fc2Vla0Zyb21UaW1lKTtcbiAgICAgICAgICAgIHRoaXMuX3NlZWtpbmcgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMuX3NlZWtGcm9tVGltZSA9IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgX29uUGxheWVyUG9zaXRpb25DaGFuZ2VkKCkge1xuICAgICAgICB0aGlzLl9jdXJyZW50VGltZSA9IHRoaXMuX3ZpZGVvLmN1cnJlbnRUaW1lO1xuXG4gICAgICAgIGlmICh0aGlzLl9waW5nU2VydmVyICYmICF0aGlzLl9zZWVraW5nICYmIHRoaXMuX25leHRUaW1lICYmIHRoaXMuX2N1cnJlbnRUaW1lID4gdGhpcy5fbmV4dFRpbWUpIHtcbiAgICAgICAgICAgIHRoaXMuX25leHRUaW1lID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgdGhpcy5fc2VuZFBpbmcobnVsbCwgdGhpcy5fY3VycmVudFRpbWUpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfc2VuZFBpbmcoZXZlbnQ6IHN0cmluZywgY3VycmVudFBvc2l0aW9uOiBudW1iZXIsIGZyb21Qb3NpdGlvbj86IG51bWJlcikge1xuICAgICAgICBsZXQgdXJsID0gYCR7dGhpcy5fcHJvdG9jb2x9Ly8ke3RoaXMuX2RvbWFpbn0vc2Vzc2lvbi9waW5nLyR7dGhpcy5fc2Vzc2lvbklkfS5qc29uPyR7dGhpcy5fY3JlYXRlUXVlcnlTdHJpbmcoZXZlbnQsIGN1cnJlbnRQb3NpdGlvbiwgZnJvbVBvc2l0aW9uKX1gO1xuXG4gICAgICAgIHZhciB4aHIgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcbiAgICAgICAgeGhyLm9wZW4oXCJHRVRcIiwgdXJsLCB0cnVlKTtcbiAgICAgICAgeGhyLnJlc3BvbnNlVHlwZSA9IFwidGV4dFwiO1xuXG4gICAgICAgIHhoci5vbmxvYWQgPSAoKSA9PiB7XG4gICAgICAgICAgICBpZiAoeGhyLnN0YXR1cyA9PT0gMjAwKSB7XG4gICAgICAgICAgICAgICAgbGV0IGpzb24gPSBKU09OLnBhcnNlKHhoci5yZXNwb25zZVRleHQpO1xuICAgICAgICAgICAgICAgIHRoaXMuX25leHRUaW1lID0ganNvbi5uZXh0X3RpbWU7XG5cbiAgICAgICAgICAgICAgICAvL2Fic2VuY2Ugb2YgZXJyb3IgcHJvcGVydHkgaW5kaWNhdGVzIG5vIGVycm9yXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuX25leHRUaW1lIDwgMCB8fCBqc29uLmhhc093blByb3BlcnR5KCdlcnJvcicpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3BpbmdTZXJ2ZXIgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fbmV4dFRpbWUgPSB1bmRlZmluZWQ7XG5cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fdmlkZW8ucmVtb3ZlRXZlbnRMaXN0ZW5lcigndGltZXVwZGF0ZScsIHRoaXMuX29uUGxheWVyUG9zaXRpb25DaGFuZ2VkKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fdmlkZW8ucmVtb3ZlRXZlbnRMaXN0ZW5lcigncGxheWluZycsIHRoaXMuX29uU3RhcnQpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl92aWRlby5yZW1vdmVFdmVudExpc3RlbmVyKCdzZWVrZWQnLCB0aGlzLl9vblNlZWtlZCk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3ZpZGVvLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3NlZWtpbmcnLCB0aGlzLl9vblNlZWtpbmcpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICB4aHIuc2VuZCgpO1xuICAgIH1cbn0iXX0=
