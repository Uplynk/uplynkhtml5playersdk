(function(){function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s}return e})()({1:[function(require,module,exports){
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
    AdaptivePlayer.prototype.load = function (info) {
        var url;
        if (typeof info === "string") {
            url = info;
        }
        else {
            url = info.url;
        }
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
        this._licenseManager = new license_manager_1.LicenseManager(this._video, this._adaptiveSource);
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
        if (this._isUplynkUrl(this._adaptiveSource.domain)) {
            this._assetInfoService = new asset_info_service_1.AssetInfoService(this._protocol, this._adaptiveSource.domain, this._adaptiveSource.sessionId);
            this._pingService = new ping_service_1.PingService(this._protocol, this._adaptiveSource.domain, this._adaptiveSource.sessionId, this._video);
        }
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
        if (this._assetInfoService) {
            this._assetInfoService.loadSegmentMap(this._segmentMap, function () {
                _this._adaptiveSource.start();
                _super.prototype.fire.call(_this, events_1.Events.SourceLoaded);
                if (_this._config.showPoster && _this.playlistType === 'VOD') {
                    var contentSegment = _this._segmentMap.contentSegments[0];
                    var contentAsset = _this._assetInfoService.getAssetInfo(contentSegment.id);
                    if (contentAsset) {
                        _this._video.poster = contentAsset.posterUrl;
                    }
                }
            });
        }
        else {
            this._adaptiveSource.start();
            _super.prototype.fire.call(this, events_1.Events.SourceLoaded);
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
    AdaptivePlayer.prototype._startLicenseRequest = function (pssh, ksUrl) {
        this._licenseManager.setKeyServerPrefix(ksUrl);
        this._licenseManager.addLicenseRequest(utils_2.base64ToBuffer(pssh));
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
            if (segment && segment.id && segment.id !== '') {
                var cue = new VTTCue(segment.startTime, segment.endTime, segment.id);
                if (cue !== undefined) {
                    cue.addEventListener("enter", function () {
                        if (_this._assetInfoService) {
                            _this._assetInfoService.loadSegment(segment, function (assetInfo) {
                                _super.prototype.fire.call(_this, events_1.Events.AssetEntered, { segment: segment, asset: assetInfo });
                            });
                        }
                        else {
                            _super.prototype.fire.call(_this, events_1.Events.AssetEntered, { segment: segment, asset: null });
                        }
                    });
                    cue.addEventListener("exit", function () {
                        if (_this._assetInfoService) {
                            _this._assetInfoService.loadSegment(segment, function (assetInfo) {
                                _super.prototype.fire.call(_this, events_1.Events.AssetExited, { segment: segment, asset: assetInfo });
                            });
                        }
                        else {
                            _super.prototype.fire.call(_this, events_1.Events.AssetEntered, { segment: segment, asset: null });
                        }
                    });
                    segmentTextTrack.addCue(cue);
                }
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
            return '02.00.18020701';
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(AdaptivePlayer.prototype, "videoBuffered", {
        get: function () {
            return this._adaptiveSource.videoBuffered;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(AdaptivePlayer.prototype, "audioBuffered", {
        get: function () {
            return this._adaptiveSource.audioBuffered;
        },
        enumerable: true,
        configurable: true
    });
    return AdaptivePlayer;
}(observable_1.Observable));
exports.AdaptivePlayer = AdaptivePlayer;

},{"./events":3,"./id3/id3-handler":5,"./license-manager":7,"./utils/observable":13,"./utils/segment-map":14,"./utils/thumbnail-helper":16,"./utils/utils":17,"./web-services/asset-info-service":18,"./web-services/ping-service":19}],3:[function(require,module,exports){
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

},{"../utils/utils":17}],5:[function(require,module,exports){
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

},{"../utils/observable":13,"../utils/utils":17,"./id3-decoder":4}],6:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var utils = require("./utils/utils");
var LicenseManagerFP = (function () {
    function LicenseManagerFP(video) {
        this._video = video;
        this._certificatePath = null;
        this._certificateData = null;
        var self = this;
        this._video.addEventListener('webkitneedkey', function (event) { self._onWebKitNeedKey(event.target, event.initData); });
    }
    LicenseManagerFP.prototype.load = function (certificatePath) {
        this._certificatePath = certificatePath;
        if (this._certificatePath == null || this._certificatePath == "") {
            console.error("[LicenseManagerFP] No Fairplay certificate path given. Cannot play.");
            return;
        }
        if (WebKitMediaKeys === undefined) {
            console.error("[LicenseManagerFP] No Fairplay browser support detected. Cannot play.");
            return;
        }
        var self = this;
        var xhr = new XMLHttpRequest();
        xhr.responseType = 'arraybuffer';
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    self.onCertificateLoaded(xhr.response);
                }
                else {
                    throw '[LicenseManagerFP] - Failed to retrieve the server certificate (' + self._certificatePath + '). Status: ' + xhr.status + ' (' + xhr.statusText + ')';
                }
            }
        };
        xhr.open('GET', this._certificatePath, true);
        xhr.setRequestHeader('Pragma', 'Cache-Control: no-cache');
        xhr.setRequestHeader("Cache-Control", "max-age=0");
        xhr.send();
    };
    LicenseManagerFP.prototype.onCertificateLoaded = function (data) {
        this._certificateData = new Uint8Array(data);
        console.log("[LicenseManagerFP] Certificate loaded successfully");
        this._video.load();
    };
    LicenseManagerFP.prototype._onWebKitNeedKey = function (video, initData) {
        if (initData === null) {
            console.error("Fairplay DRM needs a key, but no init data available.");
            return;
        }
        if (this._certificateData === null) {
            console.error("Fairplay DRM needs a key, but no certificate data available.");
            return;
        }
        var destUrl = this.getSPCUrl(initData);
        var contentData = this.extractContentId(destUrl);
        var sessionData = this.concatInitDataIdAndCertificate(initData, contentData);
        if (!video.webkitKeys) {
            var keySystem = this.selectKeySystem();
            video.webkitSetMediaKeys(new WebKitMediaKeys(keySystem));
        }
        if (!video.webkitKeys)
            throw "Could not create MediaKeys";
        var keySession = video.webkitKeys.createSession("video/mp4", sessionData);
        if (!keySession)
            throw "Could not create key session";
        keySession.contentId = contentData;
        keySession.destinationURL = destUrl;
        var self = this;
        keySession.addEventListener('webkitkeymessage', function (event) {
            self.licenseRequestReady(event.target, event.message);
        });
        keySession.addEventListener('webkitkeyadded', function (event) { self.onkeyadded(); });
        keySession.addEventListener('webkitkeyerror', function (event) { self.onkeyerror(); });
    };
    LicenseManagerFP.prototype.extractContentId = function (spcUrl) {
        var link = document.createElement('a');
        link.href = spcUrl;
        var query = link.search.substr(1);
        var id = query.split("&");
        var item = id[0].split("=");
        var cid = item[1];
        return cid;
    };
    LicenseManagerFP.prototype.getSPCUrl = function (initData) {
        var skdurl = utils.array16ToString(initData);
        var spcurl = skdurl.replace('skd://', 'https://');
        spcurl = spcurl.substring(1, spcurl.length);
        return spcurl;
    };
    LicenseManagerFP.prototype.concatInitDataIdAndCertificate = function (initData, id) {
        if (typeof id == "string")
            id = utils.stringToArray16(id);
        var offset = 0;
        var buffer = new ArrayBuffer(initData.byteLength + 4 + id.byteLength + 4 + this._certificateData.byteLength);
        var dataView = new DataView(buffer);
        var initDataArray = new Uint8Array(buffer, offset, initData.byteLength);
        initDataArray.set(initData);
        offset += initData.byteLength;
        dataView.setUint32(offset, id.byteLength, true);
        offset += 4;
        var idArray = new Uint8Array(buffer, offset, id.byteLength);
        idArray.set(id);
        offset += idArray.byteLength;
        dataView.setUint32(offset, this._certificateData.byteLength, true);
        offset += 4;
        var certArray = new Uint8Array(buffer, offset, this._certificateData.byteLength);
        certArray.set(this._certificateData);
        return new Uint8Array(buffer, 0, buffer.byteLength);
    };
    LicenseManagerFP.prototype.selectKeySystem = function () {
        if (WebKitMediaKeys.isTypeSupported("com.apple.fps.1_0", "video/mp4")) {
            return "com.apple.fps.1_0";
        }
        else {
            throw "Key System not supported";
        }
    };
    LicenseManagerFP.prototype.licenseRequestReady = function (session, message) {
        var self = this;
        var xhr = new XMLHttpRequest();
        xhr.responseType = 'json';
        xhr.session = session;
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    self.licenseRequestLoaded(xhr.response, xhr.session);
                }
                else {
                    var ex = JSON.stringify(session.response);
                    throw '[LicenseManagerFP] license request failed ' + (ex ? ex : '') + '(' + session.destinationURL + '). Status: ' + xhr.status + ' (' + xhr.statusText + ')';
                }
            }
        };
        var payload = {};
        payload["spc"] = utils.base64EncodeUint8Array(message);
        payload["assetId"] = session.contentId;
        xhr.open('POST', session.destinationURL, true);
        xhr.send(JSON.stringify(payload));
        window.console.log("[LicenseManagerFP] Fairplay key requested for asset " + session.contentId);
    };
    LicenseManagerFP.prototype.licenseRequestLoaded = function (data, session) {
        var key = utils.base64DecodeUint8Array(data['ckc']);
        session.update(key);
    };
    LicenseManagerFP.prototype.onkeyerror = function () {
        window.console.error('[LicenseManagerFP] Fairplay decryption key error was encountered');
    };
    LicenseManagerFP.prototype.onkeyadded = function () {
        window.console.log('[LicenseManagerFP] Fairplay decryption key was added to session.');
    };
    return LicenseManagerFP;
}());
exports.LicenseManagerFP = LicenseManagerFP;

},{"./utils/utils":17}],7:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var utils = require("./utils/utils");
var LicenseManager = (function () {
    function LicenseManager(video, adaptiveSource) {
        this.LICENSE_TYPE_WIDEVINE = "edef8ba9-79d6-4ace-a3c8-27dcd51d21ed";
        this.LICENSE_TYPE_PLAYREADY = "9a04f079-9840-4286-ab92-e65be0885f95";
        this._licenseType = "";
        this.playreadyKeySystem = {
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
        this._adaptiveSource = adaptiveSource;
        this._keyServerPrefix = null;
        this._pssh = null;
        this._mediaKeys = null;
        this._pendingKeyRequests = [];
        this._pendingKeyRequests = [];
        this.initMediaKeys();
    }
    LicenseManager.prototype.addLicenseRequest = function (psshData) {
        this._pendingKeyRequests.push({ initDataType: 'cenc', initData: psshData });
        this.processPendingKeys(this);
    };
    LicenseManager.prototype.setKeyServerPrefix = function (keyServerPrefix) {
        this._keyServerPrefix = keyServerPrefix;
    };
    LicenseManager.prototype.initMediaKeys = function () {
        var self = this;
        this._mediaKeys = null;
        if (navigator.requestMediaKeySystemAccess) {
            navigator.requestMediaKeySystemAccess(self.widevineKeySystem.keySystem, self.widevineKeySystem.supportedConfig)
                .then(function (keySystemAccess) {
                self._licenseType = self.LICENSE_TYPE_WIDEVINE;
                self._adaptiveSource.addSupportedProtectionScheme(self.LICENSE_TYPE_WIDEVINE);
                keySystemAccess.createMediaKeys()
                    .then(function (createdMediaKeys) {
                    self.onMediaKeyAcquired(self, createdMediaKeys);
                });
            }, function () {
                navigator.requestMediaKeySystemAccess(self.playreadyKeySystem.keySystem, self.playreadyKeySystem.supportedConfig)
                    .then(function (keySystemAccess) {
                    self._licenseType = self.LICENSE_TYPE_PLAYREADY;
                    self._adaptiveSource.addSupportedProtectionScheme(self.LICENSE_TYPE_PLAYREADY);
                    keySystemAccess.createMediaKeys()
                        .then(function (createdMediaKeys) {
                        self.onMediaKeyAcquired(self, createdMediaKeys);
                    });
                })
                    .catch(function (err) {
                    self._adaptiveSource.signalDrmError('LicenseManager - Your browser/system does not support the requested configurations for playing protected content.');
                });
            })
                .catch(function (err) {
                self._adaptiveSource.signalDrmError('LicenseManager - Your browser/system does not support the requested configurations for playing protected content.');
            });
        }
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
                    self._adaptiveSource.signalDrmError('LicenseManager - call to MediaKeySession.update() failed: ' + e);
                });
            });
        }, false);
        var reqPromise = keySession.generateRequest(initDataType, initData);
        reqPromise.catch(function (e) {
            self._adaptiveSource.signalDrmError('LicenseManager - keySession.generateRequest() failed: ' + e);
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
        var self = this;
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
                    self._adaptiveSource.signalDrmError('LicenseManager - XHR failed (' + url + '). Status: ' + xhr.status + ' (' + xhr.statusText + ')');
                }
            }
        };
        if (this._licenseType === this.LICENSE_TYPE_PLAYREADY) {
            var keyMessageXml = new DOMParser().parseFromString(String.fromCharCode.apply(null, new Uint16Array(keyMessage)), 'application/xml');
            if (keyMessageXml.getElementsByTagName('Challenge')[0]) {
                challenge = utils.base64ToBuffer(keyMessageXml.getElementsByTagName('Challenge')[0].childNodes[0].nodeValue).buffer;
            }
            else {
                self._adaptiveSource.signalDrmError('Cannot find <Challenge> in key message');
            }
            var headerNames = keyMessageXml.getElementsByTagName('name');
            var headerValues = keyMessageXml.getElementsByTagName('value');
            if (headerNames.length !== headerValues.length) {
                self._adaptiveSource.signalDrmError('Mismatched header <name>/<value> pair in key message');
            }
            for (var i = 0; i < headerNames.length; i++) {
                xhr.setRequestHeader(headerNames[i].childNodes[0].nodeValue, headerValues[i].childNodes[0].nodeValue);
            }
        }
        else if (this._licenseType === this.LICENSE_TYPE_WIDEVINE) {
            challenge = keyMessage;
        }
        xhr.send(challenge);
    };
    return LicenseManager;
}());
exports.LicenseManager = LicenseManager;

},{"./utils/utils":17}],8:[function(require,module,exports){
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
var license_manager_fp_1 = require("./license-manager-fp");
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
    NativePlayer.prototype.prepareLoad = function (url) {
        this._protocol = utils_1.getProtocol(url);
        this._firedReadyEvent = false;
        this._currentAssetId = null;
        this._video.removeEventListener('durationchange', this._onDurationChange);
        this._video.addEventListener('durationchange', this._onDurationChange);
        this._video.audioTracks.addEventListener('addtrack', this._onAudioTrackAdded.bind(this));
        this._sessionId = this._getSessionId(url);
        this._domain = this._getDomain(url);
        this._licenseManagerFP = new license_manager_fp_1.LicenseManagerFP(this._video);
        if (this._isUplynkUrl(url)) {
            this._assetInfoService = new asset_info_service_1.AssetInfoService(this._protocol, this.domain);
        }
        if (this._domain !== 'content.uplynk.com') {
            this._pingService = new ping_service_1.PingService(this._protocol, this.domain, this._sessionId, this._video);
        }
        this._url = url;
        this._video.src = url;
    };
    NativePlayer.prototype.load = function (info) {
        var url = null;
        var fairplayCertPath = null;
        if (typeof info === "string") {
            url = info;
        }
        else {
            url = info.url;
            if (info.fairplayCertificatePath != null) {
                fairplayCertPath = info.fairplayCertificatePath;
            }
        }
        this.prepareLoad(url);
        if (fairplayCertPath) {
            console.log("Loading with Fairplay");
            this._licenseManagerFP.load(fairplayCertPath);
        }
        else {
            this._video.load();
        }
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
    NativePlayer.prototype._isUplynkUrl = function (url) {
        var temp = url.toLowerCase();
        return temp.indexOf('uplynk.com') > -1 || temp.indexOf('downlynk.com') > -1;
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
        if (!this._assetInfoService) {
            return;
        }
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
            return '02.00.18020701';
        },
        enumerable: true,
        configurable: true
    });
    return NativePlayer;
}(observable_1.Observable));
exports.NativePlayer = NativePlayer;

},{"./ad/ad-break":1,"./events":3,"./id3/id3-handler":5,"./license-manager-fp":6,"./utils/observable":13,"./utils/utils":17,"./web-services/asset-info-service":18,"./web-services/ping-service":19}],9:[function(require,module,exports){
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

},{}],10:[function(require,module,exports){
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

},{}],11:[function(require,module,exports){
(function () {
    window.VTTCue = window.VTTCue || window.TextTrackCue;
})();

},{}],12:[function(require,module,exports){
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

},{"./adaptive-player":2,"./native-player":8,"./polyfill/array":9,"./polyfill/object":10,"./polyfill/vtt-cue":11}],13:[function(require,module,exports){
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

},{"./string-map":15}],14:[function(require,module,exports){
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

},{"../ad/ad-break":1}],15:[function(require,module,exports){
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

},{}],16:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var utils_1 = require("./utils");
function getThumbnail(time, segments, assetInfoService, thumbnailSize) {
    if (thumbnailSize === void 0) { thumbnailSize = "small"; }
    if (isNaN(time) || time < 0) {
        time = 0;
    }
    if (assetInfoService) {
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

},{"./utils":17}],17:[function(require,module,exports){
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
function stringToArray16(stringData) {
    var buffer = new ArrayBuffer(stringData.length * 2);
    var array = new Uint16Array(buffer);
    for (var i = 0, strLen = stringData.length; i < strLen; i++) {
        array[i] = stringData.charCodeAt(i);
    }
    return array;
}
exports.stringToArray16 = stringToArray16;
function array16ToString(array) {
    var uint16array = new Uint16Array(array.buffer);
    return String.fromCharCode.apply(null, uint16array);
}
exports.array16ToString = array16ToString;
function base64DecodeUint8Array(input) {
    var raw = window.atob(input);
    var rawLength = raw.length;
    var array = new Uint8Array(new ArrayBuffer(rawLength));
    for (var i = 0; i < rawLength; i++)
        array[i] = raw.charCodeAt(i);
    return array;
}
exports.base64DecodeUint8Array = base64DecodeUint8Array;
function base64EncodeUint8Array(input) {
    var keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    var output = "";
    var chr1, chr2, chr3, enc1, enc2, enc3, enc4;
    var i = 0;
    while (i < input.length) {
        chr1 = input[i++];
        chr2 = i < input.length ? input[i++] : Number.NaN;
        chr3 = i < input.length ? input[i++] : Number.NaN;
        enc1 = chr1 >> 2;
        enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
        enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
        enc4 = chr3 & 63;
        if (isNaN(chr2)) {
            enc3 = enc4 = 64;
        }
        else if (isNaN(chr3)) {
            enc4 = 64;
        }
        output += keyStr.charAt(enc1) + keyStr.charAt(enc2) +
            keyStr.charAt(enc3) + keyStr.charAt(enc4);
    }
    return output;
}
exports.base64EncodeUint8Array = base64EncodeUint8Array;

},{}],18:[function(require,module,exports){
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
            if (segment.id && segment.id !== '') {
                segments.push(segment);
            }
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

},{"../utils/segment-map":14,"../utils/string-map":15}],19:[function(require,module,exports){
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

},{}]},{},[12])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvdHMvYWQvYWQtYnJlYWsudHMiLCJzcmMvdHMvYWRhcHRpdmUtcGxheWVyLnRzIiwic3JjL3RzL2V2ZW50cy50cyIsInNyYy90cy9pZDMvaWQzLWRlY29kZXIudHMiLCJzcmMvdHMvaWQzL2lkMy1oYW5kbGVyLnRzIiwic3JjL3RzL2xpY2Vuc2UtbWFuYWdlci1mcC50cyIsInNyYy90cy9saWNlbnNlLW1hbmFnZXIudHMiLCJzcmMvdHMvbmF0aXZlLXBsYXllci50cyIsInNyYy90cy9wb2x5ZmlsbC9hcnJheS50cyIsInNyYy90cy9wb2x5ZmlsbC9vYmplY3QudHMiLCJzcmMvdHMvcG9seWZpbGwvdnR0LWN1ZS50cyIsInNyYy90cy91cGx5bmstY29yZS50cyIsInNyYy90cy91dGlscy9vYnNlcnZhYmxlLnRzIiwic3JjL3RzL3V0aWxzL3NlZ21lbnQtbWFwLnRzIiwic3JjL3RzL3V0aWxzL3N0cmluZy1tYXAudHMiLCJzcmMvdHMvdXRpbHMvdGh1bWJuYWlsLWhlbHBlci50cyIsInNyYy90cy91dGlscy91dGlscy50cyIsInNyYy90cy93ZWItc2VydmljZXMvYXNzZXQtaW5mby1zZXJ2aWNlLnRzIiwic3JjL3RzL3dlYi1zZXJ2aWNlcy9waW5nLXNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztBQ0FBO0lBT0ksaUJBQVksUUFBbUI7UUFDM0IsRUFBRSxDQUFDLENBQUMsUUFBUSxJQUFJLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNsQyxJQUFJLENBQUMsU0FBUyxHQUFHLFFBQVEsQ0FBQztZQUMxQixJQUFJLENBQUMsTUFBTSxHQUFHLFFBQVEsQ0FBQyxNQUFNLENBQUM7WUFDOUIsSUFBSSxDQUFDLFNBQVMsR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO1lBQ3ZDLElBQUksQ0FBQyxPQUFPLEdBQUcsUUFBUSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDO1lBQ3JELElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDO1FBQ2xELENBQUM7SUFDTCxDQUFDO0lBRUQsaUNBQWUsR0FBZixVQUFnQixJQUFZO1FBQ3hCLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUM3QyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsSUFBSSxJQUFJLElBQUksSUFBSSxJQUFJLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztnQkFDM0UsTUFBTSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDakIsQ0FBQztRQUNMLENBQUM7UUFFRCxNQUFNLENBQUMsQ0FBQyxDQUFDO0lBQ2IsQ0FBQztJQUVELDhCQUFZLEdBQVosVUFBYSxLQUFhO1FBQ3RCLEVBQUUsQ0FBQSxDQUFDLElBQUksQ0FBQyxTQUFTLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQyxJQUFJLEtBQUssR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7WUFDL0QsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDakMsQ0FBQztRQUVELE1BQU0sQ0FBQyxTQUFTLENBQUM7SUFDckIsQ0FBQztJQUVELDBCQUFRLEdBQVIsVUFBUyxJQUFZO1FBQ2pCLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxJQUFJLElBQUksSUFBSSxJQUFJLElBQUksSUFBSSxDQUFDLE9BQU8sQ0FBQztJQUMxRCxDQUFDO0lBQ0wsY0FBQztBQUFELENBdENBLEFBc0NDLElBQUE7QUF0Q1ksMEJBQU87Ozs7Ozs7Ozs7Ozs7OztBQ0FwQixpREFBZ0Q7QUFDaEQsd0VBQWdGO0FBQ2hGLDREQUEwRDtBQUMxRCxpREFBaUk7QUFFakksbURBQWlEO0FBQ2pELGdEQUFrRDtBQUVsRCxtQ0FBa0M7QUFFbEMsdUNBQXdEO0FBQ3hELHFEQUFtRDtBQUNuRCx1Q0FBMEU7QUFFMUU7SUFBb0Msa0NBQVU7SUFpQzFDLHdCQUFZLEtBQXVCLEVBQUUsT0FBdUI7UUFBNUQsWUFDSSxpQkFBTyxTQXNDVjtRQTlDZ0IsZUFBUyxHQUFrQjtZQUN4Qyx3QkFBd0IsRUFBRSxJQUFJO1lBQzlCLFVBQVUsRUFBRSxLQUFLO1lBQ2pCLEtBQUssRUFBRSxLQUFLO1lBQ1oseUJBQXlCLEVBQUUsS0FBSztTQUNuQyxDQUFDO1FBTUUsSUFBSSxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBR2QsSUFBSSxDQUFDO1lBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDO1FBQUMsQ0FBQztRQUM3RCxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUdiLEtBQUksQ0FBQyxPQUFPLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxFQUFFLEVBQUUsS0FBSSxDQUFDLFNBQVMsRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFaEUsS0FBSSxDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUM7UUFDcEIsS0FBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLHdCQUFVLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDekMsS0FBSSxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUMsd0JBQVUsQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLEtBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLEtBQUksQ0FBQyxDQUFDLENBQUM7UUFDeEUsS0FBSSxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUMsd0JBQVUsQ0FBQyxLQUFLLENBQUMsWUFBWSxFQUFFLEtBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLEtBQUksQ0FBQyxDQUFDLENBQUM7UUFDcEYsS0FBSSxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUMsd0JBQVUsQ0FBQyxLQUFLLENBQUMsWUFBWSxFQUFFLEtBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLEtBQUksQ0FBQyxDQUFDLENBQUM7UUFDcEYsS0FBSSxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUMsd0JBQVUsQ0FBQyxLQUFLLENBQUMsWUFBWSxFQUFFLEtBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLEtBQUksQ0FBQyxDQUFDLENBQUM7UUFDcEYsS0FBSSxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUMsd0JBQVUsQ0FBQyxLQUFLLENBQUMsWUFBWSxFQUFFLEtBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLEtBQUksQ0FBQyxDQUFDLENBQUM7UUFFcEYsS0FBSSxDQUFDLGtCQUFrQixHQUFHLEtBQUksQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsS0FBSSxDQUFDLENBQUM7UUFDN0QsS0FBSSxDQUFDLGVBQWUsR0FBRyxLQUFJLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxLQUFJLENBQUMsQ0FBQztRQUN2RCxLQUFJLENBQUMsY0FBYyxHQUFHLEtBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLEtBQUksQ0FBQyxDQUFDO1FBQ3JELEtBQUksQ0FBQyxrQkFBa0IsR0FBRyxLQUFJLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLEtBQUksQ0FBQyxDQUFDO1FBQzdELEtBQUksQ0FBQyxtQkFBbUIsR0FBRyxLQUFJLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLEtBQUksQ0FBQyxDQUFDO1FBQy9ELEtBQUksQ0FBQyxZQUFZLEdBQUcsS0FBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsS0FBSSxDQUFDLENBQUM7UUFFakQsS0FBSSxDQUFDLFNBQVMsR0FBRyxLQUFLLENBQUM7UUFDdkIsS0FBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7UUFDbkIsS0FBSSxDQUFDLFVBQVUsR0FBRyxLQUFLLENBQUM7UUFDeEIsS0FBSSxDQUFDLFNBQVMsR0FBRyxLQUFLLENBQUM7UUFDdkIsS0FBSSxDQUFDLGdCQUFnQixHQUFHLEtBQUssQ0FBQztRQUM5QixLQUFJLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQztRQUNwQixLQUFJLENBQUMsY0FBYyxHQUFHLEtBQUssQ0FBQztRQUM1QixLQUFJLENBQUMsV0FBVyxHQUFHLENBQUMsQ0FBQztRQUVyQixLQUFJLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztRQUM1QixLQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7O0lBQzFCLENBQUM7SUFFTyw2Q0FBb0IsR0FBNUI7UUFHSSxJQUFJLG1CQUFtQixHQUFHLE1BQU0sQ0FBQyx3QkFBd0IsQ0FBQyxnQkFBZ0IsQ0FBQyxTQUFTLEVBQUUsYUFBYSxDQUFDLENBQUM7UUFDckcsRUFBRSxDQUFDLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDO1lBRXRCLElBQUksY0FBYyxHQUFHLG1CQUFtQixDQUFDLEdBQUcsQ0FBQztZQUM3QyxJQUFJLGNBQWMsR0FBRyxtQkFBbUIsQ0FBQyxHQUFHLENBQUM7WUFFN0MsSUFBSSxNQUFJLEdBQUcsSUFBSSxDQUFDO1lBRWhCLE1BQU0sQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxhQUFhLEVBQUU7Z0JBQzlDLEdBQUcsRUFBRTtvQkFDRCxNQUFNLENBQUMsY0FBYyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDdEMsQ0FBQztnQkFDRCxHQUFHLEVBQUUsVUFBVSxHQUFXO29CQUN0QixFQUFFLENBQUMsQ0FBQyxNQUFJLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO3dCQUNqQixNQUFJLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQzt3QkFFcEIsR0FBRyxHQUFHLFVBQVUsQ0FBTSxHQUFHLENBQUMsQ0FBQzt3QkFFM0IsSUFBSSxVQUFVLEdBQUcsTUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQzt3QkFDdkMsY0FBYyxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO3dCQUt6QyxNQUFJLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztvQkFDMUMsQ0FBQztnQkFDTCxDQUFDO2dCQUNELFVBQVUsRUFBRSxLQUFLO2dCQUNqQixZQUFZLEVBQUUsS0FBSzthQUN0QixDQUFDLENBQUM7UUFDUCxDQUFDO0lBQ0wsQ0FBQztJQUVPLHVDQUFjLEdBQXRCO1FBR0ksSUFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDO1FBRWhCLE1BQU0sQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxPQUFPLEVBQUU7WUFDeEMsR0FBRyxFQUFFO2dCQUNELE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDO1lBQ3ZCLENBQUM7WUFDRCxVQUFVLEVBQUUsS0FBSztZQUNqQixZQUFZLEVBQUUsS0FBSztTQUN0QixDQUFDLENBQUM7SUFDUCxDQUFDO0lBRUQsc0JBQVcsdUJBQUs7YUFBaEI7WUFDSSxNQUFNLENBQUMsZUFBTSxDQUFDO1FBQ2xCLENBQUM7OztPQUFBO0lBRUQsZ0NBQU8sR0FBUDtRQUNJLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUVyQixFQUFFLENBQUMsQ0FBQyxPQUFPLElBQUksQ0FBQyxlQUFlLElBQUksV0FBVyxDQUFDLENBQUMsQ0FBQztZQUM3QyxJQUFJLENBQUMsZUFBZSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQzlCLElBQUksQ0FBQyxlQUFlLEdBQUcsU0FBUyxDQUFDO1FBQ3JDLENBQUM7UUFFRCxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztZQUNsQixNQUFNLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDNUMsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUM7UUFDM0IsQ0FBQztJQUNMLENBQUM7SUFFRCw2QkFBSSxHQUFKLFVBQUssSUFBeUI7UUFDMUIsSUFBSSxHQUFXLENBQUM7UUFDaEIsRUFBRSxDQUFDLENBQUMsT0FBTyxJQUFJLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQztZQUMzQixHQUFHLEdBQUcsSUFBYyxDQUFDO1FBQ3pCLENBQUM7UUFDRCxJQUFJLENBQUMsQ0FBQztZQUNGLEdBQUcsR0FBSSxJQUFtQixDQUFDLEdBQUcsQ0FBQztRQUNuQyxDQUFDO1FBRUQsSUFBSSxDQUFDLFNBQVMsR0FBRyxtQkFBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBSWxDLEVBQUUsQ0FBQyxDQUFDLG9CQUFZLEVBQUUsSUFBSSxJQUFJLENBQUMsU0FBUyxLQUFLLE9BQU8sSUFBSSxJQUFJLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN6RSxJQUFJLENBQUMsU0FBUyxHQUFHLFFBQVEsQ0FBQztZQUMxQixHQUFHLEdBQUcsUUFBUSxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDbkMsQ0FBQztRQUVELElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxLQUFLLENBQUM7UUFDOUIsSUFBSSxDQUFDLElBQUksR0FBRyxHQUFHLENBQUM7UUFDaEIsSUFBSSxDQUFDLFdBQVcsR0FBRyxTQUFTLENBQUM7UUFDN0IsSUFBSSxDQUFDLGNBQWMsR0FBRyxTQUFTLENBQUM7UUFDaEMsSUFBSSxDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUM7UUFFcEIsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLFdBQVcsRUFBRSxDQUFDO1FBQ3RDLEVBQUUsQ0FBQyxDQUFDLE9BQU8sSUFBSSxDQUFDLGVBQWUsSUFBSSxXQUFXLENBQUMsQ0FBQyxDQUFDO1lBQzdDLElBQUksQ0FBQyxlQUFlLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDOUIsSUFBSSxDQUFDLGVBQWUsR0FBRyxTQUFTLENBQUM7UUFDckMsQ0FBQztRQUVELElBQUksQ0FBQyxNQUFNLENBQUMsbUJBQW1CLENBQUMsWUFBWSxFQUFFLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBQ3ZFLElBQUksQ0FBQyxNQUFNLENBQUMsbUJBQW1CLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUNqRSxJQUFJLENBQUMsTUFBTSxDQUFDLG1CQUFtQixDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDL0QsSUFBSSxDQUFDLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLG1CQUFtQixDQUFDLENBQUM7UUFFbkUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxZQUFZLEVBQUUsSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFDcEUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBQzlELElBQUksQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUM1RCxJQUFJLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsbUJBQW1CLENBQUMsQ0FBQztRQUVoRSxJQUFJLENBQUMsTUFBTSxDQUFDLGdCQUFnQixHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRS9ELElBQUksQ0FBQyxZQUFZLENBQUMsZ0JBQWdCLENBQUMsWUFBWSxFQUFFLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBRTFFLElBQUksQ0FBQyxlQUFlLEdBQUcsSUFBSSxNQUFNLENBQUMsY0FBYyxFQUFFLENBQUM7UUFDbkQsSUFBSSxDQUFDLGVBQWUsQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUNqRSxJQUFJLENBQUMsZUFBZSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ25FLElBQUksQ0FBQyxlQUFlLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDL0QsSUFBSSxDQUFDLGVBQWUsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUMvRCxJQUFJLENBQUMsZUFBZSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQzdELElBQUksQ0FBQyxlQUFlLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQy9FLElBQUksQ0FBQyxlQUFlLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDbkUsSUFBSSxDQUFDLGVBQWUsQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUNqRSxJQUFJLENBQUMsZUFBZSxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUMvRSxJQUFJLENBQUMsZUFBZSxDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUVqRixJQUFJLENBQUMsZUFBZSxHQUFHLElBQUksZ0NBQWMsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUU1RSxFQUFFLENBQUMsQ0FBQywrQkFBdUIsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUM1QixJQUFJLENBQUMsZUFBZSxDQUFDLHVCQUF1QixDQUFDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsSUFBSSxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQy9ILENBQUM7UUFFRCxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztZQUNsQixNQUFNLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDNUMsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUM7UUFDM0IsQ0FBQztRQUVELElBQUksQ0FBQyxVQUFVLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQ2hFLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUM7UUFDbEMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUN2QixDQUFDO0lBT0QsZ0NBQU8sR0FBUDtRQUNJLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxlQUFlLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQztZQUNyQyxNQUFNLENBQUMsS0FBSyxDQUFDO1FBQ2pCLENBQUM7UUFFRCxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsWUFBWSxLQUFLLE1BQU0sSUFBSSxJQUFJLENBQUMsWUFBWSxLQUFLLE9BQU8sQ0FBQyxDQUFDLENBQUM7WUFDaEUsTUFBTSxDQUFDLElBQUksQ0FBQztRQUNoQixDQUFDO1FBSUQsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQztZQUN2QixNQUFNLENBQUMsSUFBSSxDQUFDO1FBQ2hCLENBQUM7UUFFRCxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxDQUFDO1lBQ3pDLE1BQU0sQ0FBQyxJQUFJLENBQUM7UUFDaEIsQ0FBQztRQUVELEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQztZQUNqQyxNQUFNLENBQUMsS0FBSyxDQUFDO1FBQ2pCLENBQUM7UUFFRCxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxDQUFDO0lBQ2hFLENBQUM7SUFFRCxvQ0FBVyxHQUFYLFVBQVksVUFBa0I7UUFDMUIsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFlBQVksS0FBSyxNQUFNLElBQUksSUFBSSxDQUFDLFlBQVksS0FBSyxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQ2hFLE1BQU0sQ0FBQyxVQUFVLENBQUM7UUFDdEIsQ0FBQztRQUdELEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLENBQUM7WUFDekMsTUFBTSxDQUFDLFVBQVUsQ0FBQztRQUN0QixDQUFDO1FBRUQsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQztZQUN2QixNQUFNLENBQUMsVUFBVSxDQUFDO1FBQ3RCLENBQUM7UUFFRCxJQUFJLFdBQVcsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQztRQUkxQyxJQUFJLE9BQU8sR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUN0RCxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQ1YsTUFBTSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUM7UUFDN0IsQ0FBQztRQUdELElBQUksUUFBUSxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQUMsV0FBVyxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBQzVFLEVBQUUsQ0FBQyxDQUFDLFFBQVEsSUFBSSxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFbEMsSUFBSSxDQUFDLFdBQVcsR0FBRyxVQUFVLENBQUM7WUFDOUIsSUFBSSxDQUFDLGNBQWMsR0FBRyxRQUFRLENBQUMsUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztZQUNwRCxNQUFNLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxTQUFTLENBQUM7UUFDekMsQ0FBQztRQUVELE1BQU0sQ0FBQyxVQUFVLENBQUM7SUFDdEIsQ0FBQztJQUVNLG1DQUFVLEdBQWpCLFVBQWtCLE1BQWUsRUFBRSxFQUFXLEVBQUUsTUFBZSxFQUFFLE9BQWdCO1FBQzdFLElBQUksQ0FBQyxTQUFTLEdBQUcsTUFBTSxDQUFDO1FBQ3hCLElBQUksQ0FBQyxLQUFLLEdBQUcsRUFBRSxDQUFDO1FBQ2hCLElBQUksQ0FBQyxVQUFVLEdBQUcsT0FBTyxDQUFDO1FBQzFCLElBQUksQ0FBQyxTQUFTLEdBQUcsTUFBTSxDQUFDO1FBQ3hCLElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFDO0lBQy9CLENBQUM7SUFFTywyQ0FBa0IsR0FBMUI7UUFDSSxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsZUFBZSxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1lBR3RDLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxjQUFjLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO2dCQUMvRSxJQUFJLFVBQVUsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDO2dCQUNsQyxJQUFJLENBQUMsV0FBVyxHQUFHLFNBQVMsQ0FBQztnQkFDN0IsSUFBSSxDQUFDLGNBQWMsR0FBRyxTQUFTLENBQUM7Z0JBQ2hDLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxHQUFHLFVBQVUsQ0FBQztZQUN6QyxDQUFDO1lBT0QsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLGVBQWUsSUFBSSxJQUFJLENBQUMsTUFBTSxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO2dCQUM5RCxJQUFJLENBQUMsZUFBZSxDQUFDLFlBQVksRUFBRSxDQUFDO1lBQ3hDLENBQUM7WUFJRCxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsWUFBWSxLQUFLLEtBQUssSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQztnQkFFeEcsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUM7Z0JBR25CLElBQUksS0FBSyxHQUFHLElBQUksV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDO2dCQUNyQyxJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFFakMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUN4QixDQUFDO1lBR0QsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO1FBQzNCLENBQUM7SUFDTCxDQUFDO0lBRU8sd0NBQWUsR0FBdkI7UUFJSSxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsWUFBWSxJQUFJLE9BQU8sSUFBSSxJQUFJLENBQUMsWUFBWSxJQUFJLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNuRixJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDO1lBQ3BDLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDeEIsQ0FBQztJQUNMLENBQUM7SUFFTyx1Q0FBYyxHQUF0QjtRQUNJLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsWUFBWSxJQUFJLE9BQU8sSUFBSSxJQUFJLENBQUMsWUFBWSxJQUFJLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN0RyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ3ZCLENBQUM7SUFDTCxDQUFDO0lBRU8sNENBQW1CLEdBQTNCO1FBQ0ksSUFBSSxDQUFDLGVBQWUsQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO0lBQzVDLENBQUM7SUFFTywyQ0FBa0IsR0FBMUI7UUFDSSxJQUFJLENBQUMsZUFBZSxDQUFDLHNCQUFzQixDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLFlBQVksRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ2hHLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUN6QyxDQUFDO0lBRU8sa0NBQVMsR0FBakIsVUFBa0IsS0FBa0I7UUFDaEMsaUJBQU0sSUFBSSxZQUFDLGVBQU0sQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDckMsQ0FBQztJQUVPLHdDQUFlLEdBQXZCLFVBQXdCLEtBQXdCO1FBQzVDLGlCQUFNLElBQUksWUFBQyxlQUFNLENBQUMsWUFBWSxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQzNDLENBQUM7SUFFTyx3Q0FBZSxHQUF2QixVQUF3QixLQUF3QjtRQUM1QyxpQkFBTSxJQUFJLFlBQUMsZUFBTSxDQUFDLFlBQVksRUFBRSxLQUFLLENBQUMsQ0FBQztJQUMzQyxDQUFDO0lBRU8sd0NBQWUsR0FBdkIsVUFBd0IsS0FBd0I7UUFDNUMsaUJBQU0sSUFBSSxZQUFDLGVBQU0sQ0FBQyxZQUFZLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDM0MsQ0FBQztJQUVPLHdDQUFlLEdBQXZCLFVBQXdCLEtBQWlCO1FBQ3JDLGlCQUFNLElBQUksWUFBQyxlQUFNLENBQUMsWUFBWSxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQzNDLENBQUM7SUFFTyxzQ0FBYSxHQUFyQjtRQUFBLGlCQVdDO1FBVkcsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNqRCxJQUFJLENBQUMsaUJBQWlCLEdBQUcsSUFBSSxxQ0FBZ0IsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxlQUFlLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxlQUFlLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDM0gsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLDBCQUFXLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsZUFBZSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsZUFBZSxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDbEksQ0FBQztRQUVELElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsRUFBRSxVQUFDLGdCQUE0QjtZQUMzRSxLQUFJLENBQUMsa0JBQWtCLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUM5QyxDQUFDLENBQUMsQ0FBQztRQUVILGlCQUFNLElBQUksWUFBQyxlQUFNLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDbEMsQ0FBQztJQUVPLHVDQUFjLEdBQXRCO1FBQ0ksaUJBQU0sSUFBSSxZQUFDLGVBQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUUvQixFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7WUFDekIsSUFBSSxDQUFDLGdCQUFnQixHQUFHLElBQUksQ0FBQztZQUM3QixpQkFBTSxJQUFJLFlBQUMsZUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzdCLENBQUM7SUFDTCxDQUFDO0lBRU8sdUNBQWMsR0FBdEI7UUFDSSxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDekIsSUFBSSxDQUFDLFdBQVcsR0FBRyxXQUFXLENBQUMsSUFBSSxDQUFDLFlBQVksRUFBRSxFQUFFLENBQUMsQ0FBQztRQUMxRCxDQUFDO0lBQ0wsQ0FBQztJQUVPLHNDQUFhLEdBQXJCO1FBQ0ksRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3pCLGFBQWEsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDaEMsSUFBSSxDQUFDLFdBQVcsR0FBRyxDQUFDLENBQUM7UUFDekIsQ0FBQztJQUNMLENBQUM7SUFFTyxxQ0FBWSxHQUFwQjtRQUNJLElBQUksQ0FBQyxlQUFlLENBQUMsTUFBTSxFQUFFLENBQUM7SUFDbEMsQ0FBQztJQUVPLHFDQUFZLEdBQXBCLFVBQXFCLEdBQVc7UUFDNUIsSUFBTSxJQUFJLEdBQUcsR0FBRyxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQy9CLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLElBQUksQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDaEYsQ0FBQztJQUVPLHdDQUFlLEdBQXZCO1FBQUEsaUJBc0JDO1FBbEJHLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUM7WUFDekIsSUFBSSxDQUFDLGlCQUFpQixDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFO2dCQUNwRCxLQUFJLENBQUMsZUFBZSxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUM3QixpQkFBTSxJQUFJLGFBQUMsZUFBTSxDQUFDLFlBQVksQ0FBQyxDQUFDO2dCQUdoQyxFQUFFLENBQUMsQ0FBQyxLQUFJLENBQUMsT0FBTyxDQUFDLFVBQVUsSUFBSSxLQUFJLENBQUMsWUFBWSxLQUFLLEtBQUssQ0FBQyxDQUFDLENBQUM7b0JBQ3pELElBQUksY0FBYyxHQUFHLEtBQUksQ0FBQyxXQUFXLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUN6RCxJQUFJLFlBQVksR0FBRyxLQUFJLENBQUMsaUJBQWlCLENBQUMsWUFBWSxDQUFDLGNBQWMsQ0FBQyxFQUFFLENBQUMsQ0FBQztvQkFDMUUsRUFBRSxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQzt3QkFDZixLQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sR0FBRyxZQUFZLENBQUMsU0FBUyxDQUFDO29CQUNoRCxDQUFDO2dCQUNMLENBQUM7WUFDTCxDQUFDLENBQUMsQ0FBQztRQUNQLENBQUM7UUFBQyxJQUFJLENBQUMsQ0FBQztZQUNKLElBQUksQ0FBQyxlQUFlLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDN0IsaUJBQU0sSUFBSSxZQUFDLGVBQU0sQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUNwQyxDQUFDO0lBQ0wsQ0FBQztJQUVPLHFDQUFZLEdBQXBCLFVBQXFCLE9BQWUsRUFBRSxJQUFZO1FBQzlDLGlCQUFNLElBQUksWUFBQyxlQUFNLENBQUMsU0FBUyxFQUFFLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUNqRSxDQUFDO0lBRU8sb0NBQVcsR0FBbkIsVUFBb0IsT0FBZTtRQUMvQixpQkFBTSxJQUFJLFlBQUMsZUFBTSxDQUFDLFFBQVEsRUFBRSxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUUsQ0FBQyxDQUFDO0lBQ3BELENBQUM7SUFFTyw2Q0FBb0IsR0FBNUI7UUFDSSxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsWUFBWSxLQUFLLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFDOUIsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztnQkFDcEIsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLHdCQUFVLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxVQUFVLENBQUMsQ0FBQztnQkFDbkUsSUFBSSxDQUFDLHFCQUFxQixFQUFFLENBQUM7Z0JBQzdCLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO2dCQUU3QixpQkFBTSxJQUFJLFlBQUMsZUFBTSxDQUFDLGdCQUFnQixFQUFFLEVBQUUsVUFBVSxFQUFFLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDO2dCQUN0RSxpQkFBTSxJQUFJLFlBQUMsZUFBTSxDQUFDLGNBQWMsRUFBRSxFQUFFLFFBQVEsRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7WUFDL0UsQ0FBQztRQUNMLENBQUM7UUFBQyxJQUFJLENBQUMsQ0FBQztZQUNKLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSx3QkFBVSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDbkUsaUJBQU0sSUFBSSxZQUFDLGVBQU0sQ0FBQyxnQkFBZ0IsRUFBRSxFQUFFLFVBQVUsRUFBRSxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQztRQUMxRSxDQUFDO0lBQ0wsQ0FBQztJQUVPLDZDQUFvQixHQUE1QixVQUE2QixJQUFXLEVBQUUsS0FBWTtRQUVsRCxJQUFJLENBQUMsZUFBZSxDQUFDLGtCQUFrQixDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQy9DLElBQUksQ0FBQyxlQUFlLENBQUMsaUJBQWlCLENBQUMsc0JBQWMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQ2pFLENBQUM7SUFFTyw4Q0FBcUIsR0FBN0I7UUFDSSxJQUFJLGNBQWMsR0FBRyxRQUFRLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxzQkFBc0IsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUVyRixFQUFFLENBQUMsQ0FBQyxjQUFjLEdBQUcsQ0FBQyxJQUFJLFlBQVksQ0FBQyxPQUFPLENBQUMsZUFBZSxDQUFDLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQztZQUN0RSxPQUFPLENBQUMsR0FBRyxDQUFDLHdGQUF3RixDQUFDLENBQUM7WUFDdEcsWUFBWSxDQUFDLFVBQVUsQ0FBQyxlQUFlLENBQUMsQ0FBQztZQUN6QyxZQUFZLENBQUMsVUFBVSxDQUFDLHdCQUF3QixDQUFDLENBQUM7WUFDbEQsTUFBTSxDQUFDLElBQUksQ0FBQztRQUNoQixDQUFDO1FBQ0QsSUFBSSxZQUFZLEdBQUcsWUFBWSxDQUFDLE9BQU8sQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO1FBQ2xFLElBQUksU0FBUyxHQUFHLFFBQVEsQ0FBQyxZQUFZLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2hELElBQUksR0FBRyxHQUFHLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUVyQixJQUFNLE9BQU8sR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLElBQUksQ0FBQztRQUMvQixFQUFFLENBQUMsQ0FBQyxHQUFHLEdBQUcsU0FBUyxHQUFHLE9BQU8sQ0FBQyxDQUFDLENBQUM7WUFDNUIsSUFBSSxTQUFPLEdBQUcsWUFBWSxDQUFDLE9BQU8sQ0FBQyxlQUFlLENBQUMsQ0FBQztZQUNwRCxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFPLENBQUMsQ0FBQztRQUMvQixDQUFDO1FBQ0QsTUFBTSxDQUFDLElBQUksQ0FBQztJQUNoQixDQUFDO0lBRU8sOENBQXFCLEdBQTdCLFVBQThCLE9BQWdDO1FBQzFELEVBQUUsQ0FBQyxDQUFDLE9BQU8sSUFBSSxJQUFJLENBQUM7WUFBQyxNQUFNLENBQUM7UUFFNUIsSUFBSSxTQUFTLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFBO1FBQzFCLFlBQVksQ0FBQyxPQUFPLENBQUMsc0JBQXNCLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDbEQsWUFBWSxDQUFDLE9BQU8sQ0FBQyx3QkFBd0IsRUFBRSxTQUFTLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUNyRSxZQUFZLENBQUMsT0FBTyxDQUFDLGVBQWUsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7SUFDbkUsQ0FBQztJQUVELHFDQUFZLEdBQVosVUFBYSxJQUFZLEVBQUUsSUFBaUM7UUFBakMscUJBQUEsRUFBQSxjQUFpQztRQUN4RCxNQUFNLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsaUJBQWlCLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDcEYsQ0FBQztJQUVPLDhDQUFxQixHQUE3QjtRQUFBLGlCQXdDQztRQXZDRyxFQUFFLENBQUMsQ0FBQyxPQUFPLE1BQU0sS0FBSyxXQUFXLENBQUMsQ0FBQyxDQUFDO1lBRWhDLE1BQU0sQ0FBQztRQUNYLENBQUM7UUFFRCxJQUFJLGdCQUFnQixHQUFHLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxVQUFVLEVBQUUsVUFBVSxDQUFDLENBQUM7Z0NBRWpFLENBQUM7WUFFTixJQUFJLE9BQU8sR0FBRyxPQUFLLFdBQVcsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDL0MsRUFBRSxDQUFDLENBQUMsT0FBTyxJQUFJLE9BQU8sQ0FBQyxFQUFFLElBQUksT0FBTyxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUM3QyxJQUFJLEdBQUcsR0FBRyxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLE9BQU8sQ0FBQyxPQUFPLEVBQUUsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUVyRSxFQUFFLENBQUMsQ0FBQyxHQUFHLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQztvQkFFcEIsR0FBRyxDQUFDLGdCQUFnQixDQUFDLE9BQU8sRUFBRTt3QkFDMUIsRUFBRSxDQUFDLENBQUMsS0FBSSxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQzs0QkFDekIsS0FBSSxDQUFDLGlCQUFpQixDQUFDLFdBQVcsQ0FBQyxPQUFPLEVBQUUsVUFBQyxTQUFvQjtnQ0FDN0QsaUJBQU0sSUFBSSxhQUFDLGVBQU0sQ0FBQyxZQUFZLEVBQUUsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDOzRCQUM1RSxDQUFDLENBQUMsQ0FBQzt3QkFDUCxDQUFDO3dCQUFDLElBQUksQ0FBQyxDQUFDOzRCQUNKLGlCQUFNLElBQUksYUFBQyxlQUFNLENBQUMsWUFBWSxFQUFFLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQzt3QkFDdkUsQ0FBQztvQkFDTCxDQUFDLENBQUMsQ0FBQztvQkFFSCxHQUFHLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxFQUFFO3dCQUN6QixFQUFFLENBQUMsQ0FBQyxLQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDOzRCQUN6QixLQUFJLENBQUMsaUJBQWlCLENBQUMsV0FBVyxDQUFDLE9BQU8sRUFBRSxVQUFDLFNBQW9CO2dDQUM3RCxpQkFBTSxJQUFJLGFBQUMsZUFBTSxDQUFDLFdBQVcsRUFBRSxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUM7NEJBQzNFLENBQUMsQ0FBQyxDQUFDO3dCQUNQLENBQUM7d0JBQUMsSUFBSSxDQUFDLENBQUM7NEJBQ0osaUJBQU0sSUFBSSxhQUFDLGVBQU0sQ0FBQyxZQUFZLEVBQUUsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO3dCQUN2RSxDQUFDO29CQUNMLENBQUMsQ0FBQyxDQUFDO29CQUVILGdCQUFnQixDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDakMsQ0FBQztZQUNMLENBQUM7UUFDTCxDQUFDOztRQS9CRCxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRTtvQkFBdkMsQ0FBQztTQStCVDtJQUNMLENBQUM7SUFFTyw4Q0FBcUIsR0FBN0I7UUFBQSxpQkFtQ0M7UUFsQ0csRUFBRSxDQUFDLENBQUMsT0FBTyxNQUFNLEtBQUssV0FBVyxDQUFDLENBQUMsQ0FBQztZQUVoQyxNQUFNLENBQUM7UUFDWCxDQUFDO1FBRUQsSUFBSSxRQUFRLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUM7UUFDekMsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLE1BQU0sS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3hCLE1BQU0sQ0FBQztRQUNYLENBQUM7UUFFRCxJQUFJLEtBQUssR0FBRyxJQUFJLENBQUMscUJBQXFCLENBQUMsVUFBVSxFQUFFLFVBQVUsQ0FBQyxDQUFDO2dDQUV0RCxDQUFDO1lBRU4sSUFBSSxPQUFPLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzFCLElBQUksR0FBRyxHQUFHLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsT0FBTyxDQUFDLE9BQU8sRUFBRSxTQUFTLENBQUMsQ0FBQztZQUVwRSxFQUFFLENBQUMsQ0FBQyxHQUFHLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQztnQkFFcEIsR0FBRyxDQUFDLGdCQUFnQixDQUFDLE9BQU8sRUFBRTtvQkFDMUIsaUJBQU0sSUFBSSxhQUFDLGVBQU0sQ0FBQyxjQUFjLEVBQUUsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQztnQkFDNUQsQ0FBQyxDQUFDLENBQUM7Z0JBRUgsR0FBRyxDQUFDLGdCQUFnQixDQUFDLE1BQU0sRUFBRTtvQkFDekIsaUJBQU0sSUFBSSxhQUFDLGVBQU0sQ0FBQyxhQUFhLEVBQUUsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQztnQkFDM0QsQ0FBQyxDQUFDLENBQUM7Z0JBRUgsS0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUN0QixDQUFDO1FBQ0wsQ0FBQztRQWpCRCxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFO29CQUEvQixDQUFDO1NBaUJUO1FBRUQsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVUsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxJQUFJLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLEtBQUssQ0FBQyxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDM0csaUJBQU0sSUFBSSxZQUFDLGVBQU0sQ0FBQyxjQUFjLEVBQUUsRUFBRSxPQUFPLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNoRSxDQUFDO0lBQ0wsQ0FBQztJQUVPLDhDQUFxQixHQUE3QixVQUE4QixJQUFZLEVBQUUsS0FBYTtRQUVyRCxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ3JELElBQUksS0FBSyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3RDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLEtBQUssSUFBSSxJQUFJLEtBQUssQ0FBQyxLQUFLLEtBQUssS0FBSyxDQUFDLENBQUMsQ0FBQztnQkFDL0MsTUFBTSxDQUFDLEtBQUssQ0FBQztZQUNqQixDQUFDO1FBQ0wsQ0FBQztRQUdELE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDakQsQ0FBQztJQUVNLDJDQUFrQixHQUF6QixVQUEwQixnQkFBNEI7UUFDbEQsSUFBSSxDQUFDLGVBQWUsQ0FBQyxrQkFBa0IsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO0lBQzlELENBQUM7SUFFTyx3Q0FBZSxHQUF2QjtRQUNJLElBQUksZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1FBRTNELEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssSUFBSSxnQkFBZ0IsQ0FBQyxLQUFLLElBQUksSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLElBQUksZ0JBQWdCLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQy9ILElBQUksQ0FBQyxVQUFVLEdBQUcsZ0JBQWdCLENBQUM7WUFDbkMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLGVBQWUsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQztnQkFDakUsSUFBSSxDQUFDLGVBQWUsQ0FBQyxxQkFBcUIsQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLEVBQUUsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDaEcsQ0FBQztRQUNMLENBQUM7SUFDTCxDQUFDO0lBRU8sOENBQXFCLEdBQTdCO1FBQ0ksaUJBQU0sSUFBSSxZQUFDLGVBQU0sQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO0lBQzFDLENBQUM7SUFFRCxzQkFBSSx1Q0FBVzthQUFmO1lBQ0ksTUFBTSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsV0FBVyxDQUFDO1FBQzVDLENBQUM7OztPQUFBO0lBRUQsc0JBQUksc0NBQVU7YUFBZDtZQUNJLElBQUksV0FBVyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUM7WUFFbkMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxXQUFXLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7Z0JBQzFDLEVBQUUsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO29CQUN6QixNQUFNLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUMxQixDQUFDO1lBQ0wsQ0FBQztZQUVELE1BQU0sQ0FBQyxJQUFJLENBQUM7UUFDaEIsQ0FBQzs7O09BQUE7SUFFRCxzQkFBSSx3Q0FBWTthQUFoQjtZQUNJLE1BQU0sQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLFlBQVksQ0FBQztRQUM3QyxDQUFDO2FBRUQsVUFBaUIsRUFBVTtZQUN2QixJQUFJLENBQUMsZUFBZSxDQUFDLFlBQVksR0FBRyxFQUFFLENBQUM7UUFDM0MsQ0FBQzs7O09BSkE7SUFNRCxzQkFBSSxrQ0FBTTthQUFWO1lBQ0ksTUFBTSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDO1FBQ3ZDLENBQUM7OztPQUFBO0lBRUQsc0JBQUkscUNBQVM7YUFBYjtZQUNJLE1BQU0sQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLFNBQVMsQ0FBQztRQUMxQyxDQUFDOzs7T0FBQTtJQUVELHNCQUFJLHdDQUFZO2FBQWhCO1lBQ0ksTUFBTSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsWUFBWSxDQUFDO1FBQzdDLENBQUM7OztPQUFBO0lBRUQsc0JBQUksK0NBQW1CO2FBQXZCO1lBQ0ksTUFBTSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsbUJBQW1CLENBQUM7UUFDcEQsQ0FBQzs7O09BQUE7SUFFRCxzQkFBSSxnREFBb0I7YUFBeEI7WUFDSSxNQUFNLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxvQkFBb0IsQ0FBQztRQUNyRCxDQUFDOzs7T0FBQTtJQUVELHNCQUFJLDhDQUFrQjthQUF0QjtZQUNJLE1BQU0sQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLGtCQUFrQixDQUFDO1FBQ25ELENBQUM7OztPQUFBO0lBRUQsc0JBQUksc0NBQVU7YUFBZDtZQUNJLE1BQU0sQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDO1FBQzVCLENBQUM7OztPQUFBO0lBRUQsc0JBQUksb0NBQVE7YUFBWjtZQUNJLE1BQU0sQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQztRQUNyQyxDQUFDOzs7T0FBQTtJQUVELHNCQUFJLG9DQUFRO2FBQVo7WUFDSSxNQUFNLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNwRSxDQUFDOzs7T0FBQTtJQUVELHNCQUFJLHdDQUFZO2FBQWhCO1lBQ0ksTUFBTSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsWUFBWSxDQUFDO1FBQzdDLENBQUM7OztPQUFBO0lBRUQsc0JBQUksOENBQWtCO2FBQXRCO1lBQ0ksTUFBTSxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFBO1FBQy9DLENBQUM7OztPQUFBO0lBRUQsc0JBQUkscUNBQVM7YUFBYjtZQUNJLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQztRQUM1QixDQUFDOzs7T0FBQTtJQUVELHNCQUFJLG1DQUFPO2FBQVg7WUFDSSxNQUFNLENBQUMsZ0JBQWdCLENBQUM7UUFDNUIsQ0FBQzs7O09BQUE7SUFFRCxzQkFBSSx5Q0FBYTthQUFqQjtZQUNJLE1BQU0sQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLGFBQWEsQ0FBQztRQUM5QyxDQUFDOzs7T0FBQTtJQUVELHNCQUFJLHlDQUFhO2FBQWpCO1lBQ0ksTUFBTSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsYUFBYSxDQUFDO1FBQzlDLENBQUM7OztPQUFBO0lBQ0wscUJBQUM7QUFBRCxDQXpyQkEsQUF5ckJDLENBenJCbUMsdUJBQVUsR0F5ckI3QztBQXpyQlksd0NBQWM7Ozs7O0FDZGQsUUFBQSxNQUFNLEdBQUc7SUFDbEIsVUFBVSxFQUFVLFlBQVk7SUFDaEMsV0FBVyxFQUFTLGFBQWE7SUFDakMsWUFBWSxFQUFRLGNBQWM7SUFDbEMsU0FBUyxFQUFXLFdBQVc7SUFDL0IsUUFBUSxFQUFZLFVBQVU7SUFDOUIsZ0JBQWdCLEVBQUksa0JBQWtCO0lBQ3RDLGNBQWMsRUFBTSxnQkFBZ0I7SUFDcEMsTUFBTSxFQUFjLFFBQVE7SUFDNUIsWUFBWSxFQUFRLGNBQWM7SUFDbEMsWUFBWSxFQUFRLGNBQWM7SUFDbEMsWUFBWSxFQUFRLGNBQWM7SUFDbEMsWUFBWSxFQUFRLGNBQWM7SUFDbEMsWUFBWSxFQUFRLGNBQWM7SUFDbEMsV0FBVyxFQUFTLGFBQWE7SUFDakMsY0FBYyxFQUFNLGdCQUFnQjtJQUNwQyxhQUFhLEVBQU8sZUFBZTtJQUNuQyxLQUFLLEVBQWUsT0FBTztJQUMzQixrQkFBa0IsRUFBRSxvQkFBb0I7SUFDeEMsZUFBZSxFQUFLLGlCQUFpQjtDQUN4QyxDQUFDOzs7OztBQ3BCRix3Q0FBdUM7QUE0QnZDO0lBQUE7SUF5SkEsQ0FBQztJQXZKVSxtQkFBUSxHQUFmLFVBQWdCLE1BQWtCO1FBQzlCLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNyQixNQUFNLENBQUMsU0FBUyxDQUFDO1FBQ3JCLENBQUM7UUFnQkQsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUU7WUFDaEIsTUFBTSxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUU7WUFDaEIsTUFBTSxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFFbkIsSUFBSSxTQUFTLEdBQUcsTUFBTSxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLEVBQUUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxFQUFFLENBQUMsRUFBRSxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUVwRixJQUFJLElBQUksR0FBRyxDQUFDLENBQUM7WUFDYixJQUFJLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7WUFDMUIsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO1lBQzNCLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUMxQixJQUFJLElBQUksTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBRW5CLElBQUksSUFBSSxHQUFHLGFBQUssQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDN0IsTUFBTSxDQUFDLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsQ0FBQztRQUN2RCxDQUFDO1FBRUQsTUFBTSxDQUFDLFNBQVMsQ0FBQztJQUNyQixDQUFDO0lBRU0sMEJBQWUsR0FBdEIsVUFBdUIsUUFBa0I7UUFPckMsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3BCLE1BQU0sQ0FBQyxTQUFTLENBQUM7UUFDckIsQ0FBQztRQUVELEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUV6QixNQUFNLENBQUMsU0FBUyxDQUFDO1FBQ3JCLENBQUM7UUFFRCxJQUFJLElBQUksR0FBRyxhQUFLLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNuQyxNQUFNLENBQUMsRUFBRSxLQUFLLEVBQUUsVUFBVSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO0lBQ3RELENBQUM7SUFFTSwwQkFBZSxHQUF0QixVQUF1QixRQUFrQjtRQU9yQyxFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDcEIsTUFBTSxDQUFDLFNBQVMsQ0FBQztRQUNyQixDQUFDO1FBRUQsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRXpCLE1BQU0sQ0FBQyxTQUFTLENBQUM7UUFDckIsQ0FBQztRQUVELElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQztRQUNkLElBQUksV0FBVyxHQUFHLFVBQVUsQ0FBQyxjQUFjLENBQUMsYUFBSyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUV6RSxLQUFLLElBQUksV0FBVyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUM7UUFDaEMsSUFBSSxLQUFLLEdBQUcsVUFBVSxDQUFDLGNBQWMsQ0FBQyxhQUFLLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBRW5FLE1BQU0sQ0FBQyxFQUFFLFdBQVcsRUFBRSxXQUFXLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxDQUFDO0lBQ3RELENBQUM7SUFFTSwwQkFBZSxHQUF0QixVQUF1QixRQUFrQjtRQUtyQyxFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDcEIsTUFBTSxDQUFDLFNBQVMsQ0FBQztRQUNyQixDQUFDO1FBR0QsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDO1FBQ2xCLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUM1QyxFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3pCLFNBQVMsR0FBRyxDQUFDLENBQUM7Z0JBQ2QsS0FBSyxDQUFDO1lBQ1YsQ0FBQztRQUNMLENBQUM7UUFFRCxJQUFJLEtBQUssR0FBRyxNQUFNLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsYUFBSyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUM7UUFDaEYsSUFBSSxXQUFXLEdBQUcsYUFBSyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsU0FBUyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBRXRELE1BQU0sQ0FBQyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLFdBQVcsRUFBRSxDQUFDO0lBQy9DLENBQUM7SUFXTSx5QkFBYyxHQUFyQixVQUFzQixLQUFpQjtRQUVuQyxJQUFJLEtBQVUsQ0FBQztRQUNmLElBQUksS0FBVSxDQUFDO1FBQ2YsSUFBSSxHQUFHLEdBQUcsRUFBRSxDQUFDO1FBQ2IsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ1YsSUFBSSxNQUFNLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQztRQUUxQixPQUFPLENBQUMsR0FBRyxNQUFNLEVBQUUsQ0FBQztZQUNoQixJQUFJLENBQUMsR0FBRyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNuQixNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDYixLQUFLLENBQUM7b0JBQ0YsTUFBTSxDQUFDLEdBQUcsQ0FBQztnQkFDZixLQUFLLENBQUMsQ0FBQztnQkFBQyxLQUFLLENBQUMsQ0FBQztnQkFBQyxLQUFLLENBQUMsQ0FBQztnQkFBQyxLQUFLLENBQUMsQ0FBQztnQkFBQyxLQUFLLENBQUMsQ0FBQztnQkFBQyxLQUFLLENBQUMsQ0FBQztnQkFBQyxLQUFLLENBQUM7b0JBRWxELEdBQUcsSUFBSSxNQUFNLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUM5QixLQUFLLENBQUM7Z0JBQ1YsS0FBSyxFQUFFLENBQUM7Z0JBQUMsS0FBSyxFQUFFO29CQUVaLEtBQUssR0FBRyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztvQkFDbkIsR0FBRyxJQUFJLE1BQU0sQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDO29CQUMvRCxLQUFLLENBQUM7Z0JBQ1YsS0FBSyxFQUFFO29CQUVILEtBQUssR0FBRyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztvQkFDbkIsS0FBSyxHQUFHLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO29CQUNuQixHQUFHLElBQUksTUFBTSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQzt3QkFDekMsQ0FBQyxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7d0JBQ3JCLENBQUMsQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDM0IsS0FBSyxDQUFDO1lBQ2QsQ0FBQztRQUNMLENBQUM7UUFFRCxNQUFNLENBQUMsR0FBRyxDQUFDO0lBQ2YsQ0FBQztJQUNMLGlCQUFDO0FBQUQsQ0F6SkEsQUF5SkMsSUFBQTtBQXpKWSxnQ0FBVTs7Ozs7Ozs7Ozs7Ozs7O0FDNUJ2QixrREFBaUQ7QUFDakQsNkNBQWdHO0FBQ2hHLHdDQUFnRDtBQXdDaEQ7SUFBZ0MsOEJBQVU7SUFDdEMsb0JBQVksS0FBdUI7UUFBbkMsWUFDSSxpQkFBTyxTQUVWO1FBREcsS0FBSyxDQUFDLFVBQVUsQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLEVBQUUsS0FBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsS0FBSSxDQUFDLENBQUMsQ0FBQzs7SUFDL0UsQ0FBQztJQUVPLGdDQUFXLEdBQW5CLFVBQW9CLGFBQWtCO1FBQ2xDLElBQUksS0FBSyxHQUFjLGFBQWEsQ0FBQyxLQUFLLENBQUM7UUFDM0MsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNsQyxLQUFLLENBQUMsSUFBSSxHQUFHLFFBQVEsQ0FBQztZQUN0QixLQUFLLENBQUMsZ0JBQWdCLENBQUMsV0FBVyxFQUFFLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDekUsQ0FBQztJQUNMLENBQUM7SUFFTyx3Q0FBbUIsR0FBM0IsVUFBNEIsS0FBZ0I7UUFDeEMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksSUFBSSxVQUFVLElBQUksS0FBSyxDQUFDLEtBQUssSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQ25ELE1BQU0sQ0FBQyxJQUFJLENBQUM7UUFDaEIsQ0FBQztRQUVELEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLElBQUksVUFBVSxJQUFJLEtBQUssQ0FBQywrQkFBK0IsQ0FBQyxDQUFDLENBQUM7WUFDcEUsSUFBSSxZQUFZLEdBQUcsS0FBSyxDQUFDLCtCQUErQixDQUFDO1lBQ3pELE1BQU0sQ0FBQyxZQUFZLEtBQUsscUJBQXFCLElBQUksWUFBWSxLQUFLLGtDQUFrQyxDQUFDO1FBQ3pHLENBQUM7UUFFRCxNQUFNLENBQUMsS0FBSyxDQUFDO0lBQ2pCLENBQUM7SUFFTyxvQ0FBZSxHQUF2QixVQUF3QixjQUFtQjtRQUEzQyxpQkFnQkM7UUFmRyxJQUFJLEtBQUssR0FBRyxjQUFjLENBQUMsTUFBTSxDQUFDO1FBRWxDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsS0FBSyxDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUMvQyxJQUFJLEdBQUcsR0FBRyxLQUFLLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzlCLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7Z0JBQ2YsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUN4QixDQUFDO1FBQ0wsQ0FBQztRQUVELEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUN6QyxJQUFJLEdBQUcsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3hCLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7Z0JBQ2YsR0FBRyxDQUFDLE9BQU8sR0FBRyxVQUFDLFFBQWEsSUFBTyxLQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMxRSxDQUFDO1FBQ0wsQ0FBQztJQUNMLENBQUM7SUFFTyw4QkFBUyxHQUFqQixVQUFrQixHQUFpQjtRQUMvQixJQUFJLElBQUksR0FBZSxTQUFTLENBQUM7UUFDakMsSUFBSSxRQUFRLEdBQWEsU0FBUyxDQUFDO1FBQ25DLElBQUksU0FBUyxHQUFjLFNBQVMsQ0FBQztRQUNyQyxJQUFJLFNBQVMsR0FBYyxTQUFTLENBQUM7UUFDckMsSUFBSSxTQUFTLEdBQWMsU0FBUyxDQUFDO1FBRXJDLEVBQUUsQ0FBQyxDQUFPLEdBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBRWxCLElBQUksR0FBRyxJQUFJLFVBQVUsQ0FBTyxHQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDM0MsQ0FBQztRQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBTyxHQUFJLENBQUMsS0FBSyxJQUFVLEdBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxJQUFVLEdBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztZQVMzRSxFQUFFLENBQUMsQ0FBTyxHQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDO2dCQUNsQyxJQUFJLE9BQU8sR0FBd0IsR0FBSSxDQUFDLEtBQUssQ0FBQztnQkFDOUMsU0FBUyxHQUFHLEVBQUUsS0FBSyxFQUFFLE9BQU8sQ0FBQyxJQUFJLEVBQUUsV0FBVyxFQUFFLFNBQVMsRUFBRSxDQUFDO1lBQ2hFLENBQUM7WUFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQU8sR0FBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLEtBQUssTUFBTSxDQUFDLENBQUMsQ0FBQztnQkFDekMsSUFBSSxPQUFPLEdBQXdCLEdBQUksQ0FBQyxLQUFLLENBQUM7Z0JBQzlDLFNBQVMsR0FBRyxFQUFFLEtBQUssRUFBRSxPQUFPLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLFVBQVUsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUM1RSxDQUFDO1FBQ0wsQ0FBQztRQUFDLElBQUksQ0FBQyxDQUFDO1lBRUosSUFBSSxHQUFHLHNCQUFjLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3BDLENBQUM7UUFFRCxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQ1AsUUFBUSxHQUFHLHdCQUFVLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3JDLEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7Z0JBQ1gsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDO29CQUMzQixTQUFTLEdBQUcsd0JBQVUsQ0FBQyxlQUFlLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBQ3JELENBQUM7Z0JBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEtBQUssTUFBTSxDQUFDLENBQUMsQ0FBQztvQkFDbEMsU0FBUyxHQUFHLHdCQUFVLENBQUMsZUFBZSxDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUNyRCxDQUFDO2dCQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUM7b0JBQ2xDLFNBQVMsR0FBRyx3QkFBVSxDQUFDLGVBQWUsQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDckQsQ0FBQztZQUNMLENBQUM7UUFDTCxDQUFDO1FBRUQsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztZQUNYLElBQUksT0FBSyxHQUFnQixFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxDQUFDO1lBQ3ZELGlCQUFNLElBQUksWUFBQyxVQUFVLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxPQUFLLENBQUMsQ0FBQztRQUMvQyxDQUFDO1FBRUQsRUFBRSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztZQUNaLElBQUksU0FBUyxHQUFzQixFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxDQUFDO1lBQ2xFLGlCQUFNLElBQUksWUFBQyxVQUFVLENBQUMsS0FBSyxDQUFDLFlBQVksRUFBRSxTQUFTLENBQUMsQ0FBQztZQUVyRCxFQUFFLENBQUMsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztnQkFDbEIsSUFBSSxTQUFTLEdBQUcsU0FBUyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQzNDLEVBQUUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxNQUFNLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDeEIsSUFBSSxVQUFVLEdBQWUsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLE9BQU8sRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsT0FBTyxFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxVQUFVLEVBQUUsUUFBUSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDO29CQUNoSSxpQkFBTSxJQUFJLFlBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxZQUFZLEVBQUUsVUFBVSxDQUFDLENBQUM7Z0JBQzFELENBQUM7WUFDTCxDQUFDO1FBQ0wsQ0FBQztRQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO1lBQ25CLElBQUksU0FBUyxHQUFzQixFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxDQUFDO1lBQ2xFLGlCQUFNLElBQUksWUFBQyxVQUFVLENBQUMsS0FBSyxDQUFDLFlBQVksRUFBRSxTQUFTLENBQUMsQ0FBQztRQUN6RCxDQUFDO1FBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7WUFDbkIsSUFBSSxTQUFTLEdBQXNCLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLENBQUM7WUFDbEUsaUJBQU0sSUFBSSxZQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsWUFBWSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQ3pELENBQUM7SUFDTCxDQUFDO0lBRUQsc0JBQVcsbUJBQUs7YUFBaEI7WUFDSSxNQUFNLENBQUM7Z0JBQ0gsTUFBTSxFQUFFLFFBQVE7Z0JBQ2hCLFlBQVksRUFBRSxjQUFjO2dCQUM1QixZQUFZLEVBQUUsY0FBYztnQkFDNUIsWUFBWSxFQUFFLGNBQWM7Z0JBQzVCLFlBQVksRUFBRSxjQUFjO2FBQy9CLENBQUM7UUFDTixDQUFDOzs7T0FBQTtJQUNMLGlCQUFDO0FBQUQsQ0EzSEEsQUEySEMsQ0EzSCtCLHVCQUFVLEdBMkh6QztBQTNIWSxnQ0FBVTs7Ozs7QUMxQ3ZCLHFDQUF1QztBQUV2QztJQUtJLDBCQUFZLEtBQXVCO1FBQy9CLElBQUksQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDO1FBQ3BCLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxJQUFJLENBQUM7UUFDN0IsSUFBSSxDQUFDLGdCQUFnQixHQUFHLElBQUksQ0FBQztRQUU3QixJQUFJLElBQUksR0FBRyxJQUFJLENBQUM7UUFDaEIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxlQUFlLEVBQUUsVUFBUyxLQUFVLElBQUksSUFBSSxDQUFDLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDakksQ0FBQztJQUVNLCtCQUFJLEdBQVgsVUFBWSxlQUF1QjtRQUMvQixJQUFJLENBQUMsZ0JBQWdCLEdBQUcsZUFBZSxDQUFDO1FBQ3hDLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsSUFBSSxJQUFJLElBQUksSUFBSSxDQUFDLGdCQUFnQixJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDL0QsT0FBTyxDQUFDLEtBQUssQ0FBQyxxRUFBcUUsQ0FBQyxDQUFBO1lBQ3BGLE1BQU0sQ0FBQztRQUNYLENBQUM7UUFDRCxFQUFFLENBQUMsQ0FBQyxlQUFlLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQztZQUNoQyxPQUFPLENBQUMsS0FBSyxDQUFDLHVFQUF1RSxDQUFDLENBQUE7WUFDdEYsTUFBTSxDQUFDO1FBQ1gsQ0FBQztRQUVELElBQUksSUFBSSxHQUFHLElBQUksQ0FBQztRQUNoQixJQUFJLEdBQUcsR0FBRyxJQUFJLGNBQWMsRUFBRSxDQUFDO1FBQy9CLEdBQUcsQ0FBQyxZQUFZLEdBQUcsYUFBYSxDQUFDO1FBQ2pDLEdBQUcsQ0FBQyxrQkFBa0IsR0FBRztZQUNyQixFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsVUFBVSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3ZCLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxNQUFNLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQztvQkFDckIsSUFBSSxDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDM0MsQ0FBQztnQkFBQyxJQUFJLENBQUMsQ0FBQztvQkFDSixNQUFNLGtFQUFrRSxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxhQUFhLEdBQUcsR0FBRyxDQUFDLE1BQU0sR0FBRyxJQUFJLEdBQUcsR0FBRyxDQUFDLFVBQVUsR0FBRyxHQUFHLENBQUM7Z0JBQ2hLLENBQUM7WUFDTCxDQUFDO1FBQ0wsQ0FBQyxDQUFDO1FBQ0YsR0FBRyxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLGdCQUFnQixFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzdDLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLEVBQUUseUJBQXlCLENBQUMsQ0FBQztRQUMxRCxHQUFHLENBQUMsZ0JBQWdCLENBQUMsZUFBZSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBQ25ELEdBQUcsQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUNmLENBQUM7SUFFTyw4Q0FBbUIsR0FBM0IsVUFBNEIsSUFBaUI7UUFDekMsSUFBSSxDQUFDLGdCQUFnQixHQUFHLElBQUksVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzdDLE9BQU8sQ0FBQyxHQUFHLENBQUMsb0RBQW9ELENBQUMsQ0FBQztRQUdsRSxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDO0lBQ3ZCLENBQUM7SUFHTywyQ0FBZ0IsR0FBeEIsVUFBeUIsS0FBVSxFQUFFLFFBQXFCO1FBQ3RELEVBQUUsQ0FBQyxDQUFDLFFBQVEsS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQ3BCLE9BQU8sQ0FBQyxLQUFLLENBQUMsdURBQXVELENBQUMsQ0FBQztZQUN2RSxNQUFNLENBQUM7UUFDWCxDQUFDO1FBQ0QsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLGdCQUFnQixLQUFLLElBQUksQ0FBQyxDQUFDLENBQUM7WUFDakMsT0FBTyxDQUFDLEtBQUssQ0FBQyw4REFBOEQsQ0FBQyxDQUFDO1lBQzlFLE1BQU0sQ0FBQztRQUNYLENBQUM7UUFFRCxJQUFJLE9BQU8sR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ3ZDLElBQUksV0FBVyxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNqRCxJQUFJLFdBQVcsR0FBRyxJQUFJLENBQUMsOEJBQThCLENBQUMsUUFBUSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBRTdFLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7WUFDcEIsSUFBSSxTQUFTLEdBQUcsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO1lBQ3ZDLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLGVBQWUsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO1FBQzdELENBQUM7UUFFRCxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUM7WUFDbEIsTUFBTSw0QkFBNEIsQ0FBQztRQUV2QyxJQUFJLFVBQVUsR0FBRyxLQUFLLENBQUMsVUFBVSxDQUFDLGFBQWEsQ0FBQyxXQUFXLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFDMUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUM7WUFDWixNQUFNLDhCQUE4QixDQUFDO1FBQ3pDLFVBQVUsQ0FBQyxTQUFTLEdBQUcsV0FBVyxDQUFDO1FBQ25DLFVBQVUsQ0FBQyxjQUFjLEdBQUcsT0FBTyxDQUFDO1FBQ3BDLElBQUksSUFBSSxHQUFHLElBQUksQ0FBQztRQUNoQixVQUFVLENBQUMsZ0JBQWdCLENBQUMsa0JBQWtCLEVBQUUsVUFBVSxLQUFVO1lBQ2hFLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUMxRCxDQUFDLENBQUMsQ0FBQztRQUNILFVBQVUsQ0FBQyxnQkFBZ0IsQ0FBQyxnQkFBZ0IsRUFBRSxVQUFVLEtBQVUsSUFBSSxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM1RixVQUFVLENBQUMsZ0JBQWdCLENBQUMsZ0JBQWdCLEVBQUUsVUFBVSxLQUFVLElBQUksSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDaEcsQ0FBQztJQUVPLDJDQUFnQixHQUF4QixVQUF5QixNQUFjO1FBRW5DLElBQUksSUFBSSxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDdkMsSUFBSSxDQUFDLElBQUksR0FBRyxNQUFNLENBQUM7UUFDbkIsSUFBSSxLQUFLLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDbEMsSUFBSSxFQUFFLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUMxQixJQUFJLElBQUksR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQzVCLElBQUksR0FBRyxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNsQixNQUFNLENBQUMsR0FBRyxDQUFDO0lBQ2YsQ0FBQztJQUVPLG9DQUFTLEdBQWpCLFVBQWtCLFFBQXFCO1FBQ25DLElBQUksTUFBTSxHQUFHLEtBQUssQ0FBQyxlQUFlLENBQUMsUUFBUSxDQUFDLENBQUM7UUFFN0MsSUFBSSxNQUFNLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDbEQsTUFBTSxHQUFHLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUM1QyxNQUFNLENBQUMsTUFBTSxDQUFDO0lBQ2xCLENBQUM7SUFFTyx5REFBOEIsR0FBdEMsVUFBdUMsUUFBcUIsRUFBRSxFQUFPO1FBQ2pFLEVBQUUsQ0FBQyxDQUFDLE9BQU8sRUFBRSxJQUFJLFFBQVEsQ0FBQztZQUN0QixFQUFFLEdBQUcsS0FBSyxDQUFDLGVBQWUsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUVuQyxJQUFJLE1BQU0sR0FBRyxDQUFDLENBQUM7UUFDZixJQUFJLE1BQU0sR0FBRyxJQUFJLFdBQVcsQ0FBQyxRQUFRLENBQUMsVUFBVSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUMsVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDN0csSUFBSSxRQUFRLEdBQUcsSUFBSSxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFcEMsSUFBSSxhQUFhLEdBQUcsSUFBSSxVQUFVLENBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDeEUsYUFBYSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUM1QixNQUFNLElBQUksUUFBUSxDQUFDLFVBQVUsQ0FBQztRQUU5QixRQUFRLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ2hELE1BQU0sSUFBSSxDQUFDLENBQUM7UUFFWixJQUFJLE9BQU8sR0FBRyxJQUFJLFVBQVUsQ0FBQyxNQUFNLEVBQUUsTUFBTSxFQUFFLEVBQUUsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUM1RCxPQUFPLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ2hCLE1BQU0sSUFBSSxPQUFPLENBQUMsVUFBVSxDQUFDO1FBRTdCLFFBQVEsQ0FBQyxTQUFTLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDbkUsTUFBTSxJQUFJLENBQUMsQ0FBQztRQUVaLElBQUksU0FBUyxHQUFHLElBQUksVUFBVSxDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ2pGLFNBQVMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFFckMsTUFBTSxDQUFDLElBQUksVUFBVSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQ3hELENBQUM7SUFFTywwQ0FBZSxHQUF2QjtRQUNJLEVBQUUsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxlQUFlLENBQUMsbUJBQW1CLEVBQUUsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3BFLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQztRQUMvQixDQUFDO1FBQ0QsSUFBSSxDQUFDLENBQUM7WUFDRixNQUFNLDBCQUEwQixDQUFDO1FBQ3JDLENBQUM7SUFDTCxDQUFDO0lBRU8sOENBQW1CLEdBQTNCLFVBQTRCLE9BQVksRUFBRSxPQUFZO1FBQ2xELElBQUksSUFBSSxHQUFHLElBQUksQ0FBQztRQUNoQixJQUFJLEdBQUcsR0FBRyxJQUFJLGNBQWMsRUFBRSxDQUFDO1FBQy9CLEdBQUcsQ0FBQyxZQUFZLEdBQUcsTUFBTSxDQUFDO1FBQ3pCLEdBQVcsQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDO1FBQy9CLEdBQUcsQ0FBQyxrQkFBa0IsR0FBRztZQUNyQixFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsVUFBVSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3ZCLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxNQUFNLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQztvQkFDckIsSUFBSSxDQUFDLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUcsR0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDO2dCQUNsRSxDQUFDO2dCQUFDLElBQUksQ0FBQyxDQUFDO29CQUNKLElBQUksRUFBRSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDO29CQUMxQyxNQUFNLDRDQUE0QyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEdBQUcsR0FBRyxPQUFPLENBQUMsY0FBYyxHQUFHLGFBQWEsR0FBRyxHQUFHLENBQUMsTUFBTSxHQUFHLElBQUksR0FBRyxHQUFHLENBQUMsVUFBVSxHQUFHLEdBQUcsQ0FBQztnQkFDbEssQ0FBQztZQUNMLENBQUM7UUFDTCxDQUFDLENBQUM7UUFFRixJQUFJLE9BQU8sR0FBUSxFQUFFLENBQUM7UUFDdEIsT0FBTyxDQUFDLEtBQUssQ0FBQyxHQUFHLEtBQUssQ0FBQyxzQkFBc0IsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUN2RCxPQUFPLENBQUMsU0FBUyxDQUFDLEdBQUcsT0FBTyxDQUFDLFNBQVMsQ0FBQztRQUN2QyxHQUFHLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxPQUFPLENBQUMsY0FBYyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQy9DLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1FBRWxDLE1BQU0sQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLHNEQUFzRCxHQUFHLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUNuRyxDQUFDO0lBRU8sK0NBQW9CLEdBQTVCLFVBQTZCLElBQVMsRUFBRSxPQUFZO1FBQ2hELElBQUksR0FBRyxHQUFHLEtBQUssQ0FBQyxzQkFBc0IsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUNwRCxPQUFPLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ3hCLENBQUM7SUFFTyxxQ0FBVSxHQUFsQjtRQUNJLE1BQU0sQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLGtFQUFrRSxDQUFDLENBQUM7SUFDN0YsQ0FBQztJQUVPLHFDQUFVLEdBQWxCO1FBQ0ksTUFBTSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0VBQWtFLENBQUMsQ0FBQztJQUMzRixDQUFDO0lBQ0wsdUJBQUM7QUFBRCxDQXBMQSxBQW9MQyxJQUFBO0FBcExZLDRDQUFnQjs7Ozs7QUNGN0IscUNBQXVDO0FBRXZDO0lBdUVJLHdCQUFZLEtBQXVCLEVBQUUsY0FBcUM7UUFyRWpFLDBCQUFxQixHQUFHLHNDQUFzQyxDQUFDO1FBQy9ELDJCQUFzQixHQUFHLHNDQUFzQyxDQUFDO1FBTWpFLGlCQUFZLEdBQUcsRUFBRSxDQUFDO1FBS25CLHVCQUFrQixHQUFHO1lBQ3hCLFNBQVMsRUFBRSx5QkFBeUI7WUFDcEMsZUFBZSxFQUFFO2dCQUNiO29CQUNJLGFBQWEsRUFBRSxDQUFDLFFBQVEsRUFBRSxNQUFNLENBQUM7b0JBQ2pDLGlCQUFpQixFQUNiO3dCQUNJOzRCQUNJLFdBQVcsRUFBRSwwQkFBMEI7NEJBQ3ZDLFVBQVUsRUFBRSxFQUFFO3lCQUNqQjtxQkFDSjtvQkFDTCxpQkFBaUIsRUFDYjt3QkFDSTs0QkFDSSxXQUFXLEVBQUUsMEJBQTBCOzRCQUN2QyxVQUFVLEVBQUUsRUFBRTt5QkFDakI7cUJBQ0o7aUJBQ1I7YUFDSjtTQUNKLENBQUM7UUFFSyxzQkFBaUIsR0FBRztZQUN2QixTQUFTLEVBQUUsb0JBQW9CO1lBQy9CLGVBQWUsRUFBRTtnQkFDYjtvQkFDSSxLQUFLLEVBQUUsS0FBSztvQkFDWixhQUFhLEVBQUUsQ0FBQyxNQUFNLENBQUM7b0JBQ3ZCLFlBQVksRUFBRSxDQUFDLFdBQVcsQ0FBQztvQkFDM0IsaUJBQWlCLEVBQ2I7d0JBQ0ksRUFBRSxXQUFXLEVBQUUsK0JBQStCLEVBQUUsVUFBVSxFQUFFLGtCQUFrQixFQUFFO3FCQUNuRjtvQkFDTCxpQkFBaUIsRUFDYjt3QkFFSSxFQUFFLFdBQVcsRUFBRSxpQ0FBaUMsRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFO3dCQUMvRSxFQUFFLFdBQVcsRUFBRSxpQ0FBaUMsRUFBRSxVQUFVLEVBQUUsa0JBQWtCLEVBQUU7d0JBQ2xGLEVBQUUsV0FBVyxFQUFFLGlDQUFpQyxFQUFFLFVBQVUsRUFBRSxrQkFBa0IsRUFBRTt3QkFDbEYsRUFBRSxXQUFXLEVBQUUsaUNBQWlDLEVBQUUsVUFBVSxFQUFFLGtCQUFrQixFQUFFO3dCQUNsRixFQUFFLFdBQVcsRUFBRSxpQ0FBaUMsRUFBRSxVQUFVLEVBQUUsa0JBQWtCLEVBQUU7d0JBQ2xGLEVBQUUsV0FBVyxFQUFFLGlDQUFpQyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUU7d0JBQy9FLEVBQUUsV0FBVyxFQUFFLGlDQUFpQyxFQUFFLFVBQVUsRUFBRSxrQkFBa0IsRUFBRTt3QkFDbEYsRUFBRSxXQUFXLEVBQUUsaUNBQWlDLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRTt3QkFDL0UsRUFBRSxXQUFXLEVBQUUsaUNBQWlDLEVBQUUsVUFBVSxFQUFFLGtCQUFrQixFQUFFO3dCQUNsRixFQUFFLFdBQVcsRUFBRSxpQ0FBaUMsRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFO3dCQUMvRSxFQUFFLFdBQVcsRUFBRSxpQ0FBaUMsRUFBRSxVQUFVLEVBQUUsa0JBQWtCLEVBQUU7d0JBQ2xGLEVBQUUsV0FBVyxFQUFFLGlDQUFpQyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUU7d0JBQy9FLEVBQUUsV0FBVyxFQUFFLGlDQUFpQyxFQUFFLFVBQVUsRUFBRSxrQkFBa0IsRUFBRTt3QkFDbEYsRUFBRSxXQUFXLEVBQUUsaUNBQWlDLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRTt3QkFDL0UsRUFBRSxXQUFXLEVBQUUsaUNBQWlDLEVBQUUsVUFBVSxFQUFFLGtCQUFrQixFQUFFO3FCQUNyRjtpQkFDUjthQUNKO1NBQ0osQ0FBQztRQUlFLElBQUksQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDO1FBQ3BCLElBQUksQ0FBQyxlQUFlLEdBQUcsY0FBYyxDQUFDO1FBQ3RDLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxJQUFJLENBQUM7UUFDN0IsSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUM7UUFDbEIsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUM7UUFDdkIsSUFBSSxDQUFDLG1CQUFtQixHQUFHLEVBQUUsQ0FBQztRQUM5QixJQUFJLENBQUMsbUJBQW1CLEdBQUcsRUFBRSxDQUFDO1FBQzlCLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztJQUN6QixDQUFDO0lBRU0sMENBQWlCLEdBQXhCLFVBQXlCLFFBQW9CO1FBRXpDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsRUFBRSxZQUFZLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsQ0FBQyxDQUFDO1FBQzVFLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNsQyxDQUFDO0lBRU0sMkNBQWtCLEdBQXpCLFVBQTBCLGVBQXVCO1FBRTdDLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxlQUFlLENBQUM7SUFDNUMsQ0FBQztJQUVPLHNDQUFhLEdBQXJCO1FBRUksSUFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDO1FBQ2hCLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDO1FBRXZCLEVBQUUsQ0FBQyxDQUFDLFNBQVMsQ0FBQywyQkFBMkIsQ0FBQyxDQUFDLENBQUM7WUFDeEMsU0FBUyxDQUFDLDJCQUEyQixDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLGlCQUFpQixDQUFDLGVBQWUsQ0FBQztpQkFDMUcsSUFBSSxDQUFDLFVBQVUsZUFBZTtnQkFFM0IsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLENBQUMscUJBQXFCLENBQUM7Z0JBQy9DLElBQUksQ0FBQyxlQUFlLENBQUMsNEJBQTRCLENBQUMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLENBQUM7Z0JBRTlFLGVBQWUsQ0FBQyxlQUFlLEVBQUU7cUJBQzVCLElBQUksQ0FBQyxVQUFVLGdCQUFnQjtvQkFDNUIsSUFBSSxDQUFDLGtCQUFrQixDQUFDLElBQUksRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO2dCQUNwRCxDQUFDLENBQUMsQ0FBQztZQUVYLENBQUMsRUFBRTtnQkFFQyxTQUFTLENBQUMsMkJBQTJCLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsa0JBQWtCLENBQUMsZUFBZSxDQUFDO3FCQUM1RyxJQUFJLENBQUMsVUFBVSxlQUFlO29CQUUzQixJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQyxzQkFBc0IsQ0FBQztvQkFDaEQsSUFBSSxDQUFDLGVBQWUsQ0FBQyw0QkFBNEIsQ0FBQyxJQUFJLENBQUMsc0JBQXNCLENBQUMsQ0FBQztvQkFFL0UsZUFBZSxDQUFDLGVBQWUsRUFBRTt5QkFDNUIsSUFBSSxDQUFDLFVBQVUsZ0JBQWdCO3dCQUM1QixJQUFJLENBQUMsa0JBQWtCLENBQUMsSUFBSSxFQUFFLGdCQUFnQixDQUFDLENBQUM7b0JBQ3BELENBQUMsQ0FBQyxDQUFDO2dCQUVYLENBQUMsQ0FBQztxQkFDRCxLQUFLLENBQUMsVUFBVSxHQUFHO29CQUNoQixJQUFJLENBQUMsZUFBZSxDQUFDLGNBQWMsQ0FBQyxtSEFBbUgsQ0FBQyxDQUFDO2dCQUM3SixDQUFDLENBQUMsQ0FBQztZQUNYLENBQUMsQ0FBQztpQkFDRCxLQUFLLENBQUMsVUFBVSxHQUFHO2dCQUNoQixJQUFJLENBQUMsZUFBZSxDQUFDLGNBQWMsQ0FBQyxtSEFBbUgsQ0FBQyxDQUFDO1lBQzdKLENBQUMsQ0FBQyxDQUFDO1FBQ1gsQ0FBQztJQUNMLENBQUM7SUFFTywyQ0FBa0IsR0FBMUIsVUFBMkIsSUFBb0IsRUFBRSxnQkFBMkI7UUFHeEUsSUFBSSxDQUFDLFVBQVUsR0FBRyxnQkFBZ0IsQ0FBQztRQUNuQyxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDMUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2xDLENBQUM7SUFFTywyQ0FBa0IsR0FBMUIsVUFBMkIsSUFBb0I7UUFHM0MsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVUsS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQzNCLE1BQU0sQ0FBQztRQUNYLENBQUM7UUFFRCxPQUFPLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDekMsSUFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDLG1CQUFtQixDQUFDLEtBQUssRUFBRSxDQUFDO1lBQzVDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUM1RCxDQUFDO0lBQ0wsQ0FBQztJQUVPLHlDQUFnQixHQUF4QixVQUF5QixZQUFvQixFQUFFLFFBQW9CO1FBRy9ELElBQUksSUFBSSxHQUFHLElBQUksQ0FBQztRQUNoQixJQUFJLFVBQVUsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUM1RCxVQUFVLENBQUMsZ0JBQWdCLENBQUMsU0FBUyxFQUFFLFVBQVUsS0FBMkI7WUFHeEUsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLEVBQUUsS0FBSyxDQUFDLE9BQU8sRUFBRSxVQUFVLElBQWlCO2dCQUloRixJQUFJLElBQUksR0FBb0MsS0FBSyxDQUFDLE1BQU8sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ3ZFLElBQUksQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFTO29CQUMxQixJQUFJLENBQUMsZUFBZSxDQUFDLGNBQWMsQ0FBQyw0REFBNEQsR0FBRyxDQUFDLENBQUMsQ0FBQztnQkFDMUcsQ0FBQyxDQUFDLENBQUM7WUFFUCxDQUFDLENBQUMsQ0FBQztRQUNQLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUVWLElBQUksVUFBVSxHQUFrQixVQUFVLENBQUMsZUFBZSxDQUFDLFlBQVksRUFBRSxRQUFRLENBQUMsQ0FBQztRQUNuRixVQUFVLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBUztZQUNoQyxJQUFJLENBQUMsZUFBZSxDQUFDLGNBQWMsQ0FBQyx3REFBd0QsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUN0RyxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7SUFFTyxzQ0FBYSxHQUFyQjtRQUNJLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxZQUFZLEtBQUssSUFBSSxDQUFDLHNCQUFzQixDQUFDLENBQUMsQ0FBQztZQUNwRCxNQUFNLENBQUMsSUFBSSxDQUFDLGdCQUFnQixHQUFHLEtBQUssQ0FBQztRQUN6QyxDQUFDO1FBQ0QsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxZQUFZLEtBQUssSUFBSSxDQUFDLHFCQUFxQixDQUFDLENBQUMsQ0FBQztZQUN4RCxNQUFNLENBQUMsSUFBSSxDQUFDLGdCQUFnQixHQUFHLEtBQUssQ0FBQztRQUN6QyxDQUFDO1FBQ0QsTUFBTSxDQUFDLEVBQUUsQ0FBQztJQUNkLENBQUM7SUFFTyx1Q0FBYyxHQUF0QixVQUF1QixHQUFXLEVBQUUsVUFBdUIsRUFBRSxRQUFhO1FBR3RFLElBQUksSUFBSSxHQUFHLElBQUksQ0FBQztRQUVoQixJQUFJLFNBQXNCLENBQUM7UUFDM0IsSUFBSSxHQUFHLEdBQUcsSUFBSSxjQUFjLEVBQUUsQ0FBQztRQUMvQixHQUFHLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxHQUFHLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDNUIsR0FBRyxDQUFDLGVBQWUsR0FBRyxJQUFJLENBQUM7UUFDM0IsR0FBRyxDQUFDLFlBQVksR0FBRyxhQUFhLENBQUM7UUFDakMsR0FBRyxDQUFDLGtCQUFrQixHQUFHO1lBQ3JCLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxVQUFVLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDdkIsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDO29CQUNyQixRQUFRLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUMzQixDQUFDO2dCQUFDLElBQUksQ0FBQyxDQUFDO29CQUNKLElBQUksQ0FBQyxlQUFlLENBQUMsY0FBYyxDQUFDLCtCQUErQixHQUFHLEdBQUcsR0FBRyxhQUFhLEdBQUcsR0FBRyxDQUFDLE1BQU0sR0FBRyxJQUFJLEdBQUcsR0FBRyxDQUFDLFVBQVUsR0FBRyxHQUFHLENBQUMsQ0FBQztnQkFDMUksQ0FBQztZQUNMLENBQUM7UUFDTCxDQUFDLENBQUM7UUFDRixFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsWUFBWSxLQUFLLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDLENBQUM7WUFFcEQsSUFBSSxhQUFhLEdBQUcsSUFBSSxTQUFTLEVBQUUsQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLElBQUksV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztZQUNySSxFQUFFLENBQUMsQ0FBQyxhQUFhLENBQUMsb0JBQW9CLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNyRCxTQUFTLEdBQUcsS0FBSyxDQUFDLGNBQWMsQ0FBQyxhQUFhLENBQUMsb0JBQW9CLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLE1BQU0sQ0FBQztZQUN4SCxDQUFDO1lBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ0osSUFBSSxDQUFDLGVBQWUsQ0FBQyxjQUFjLENBQUMsd0NBQXdDLENBQUMsQ0FBQztZQUNsRixDQUFDO1lBQ0QsSUFBSSxXQUFXLEdBQUcsYUFBYSxDQUFDLG9CQUFvQixDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQzdELElBQUksWUFBWSxHQUFHLGFBQWEsQ0FBQyxvQkFBb0IsQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUMvRCxFQUFFLENBQUMsQ0FBQyxXQUFXLENBQUMsTUFBTSxLQUFLLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO2dCQUM3QyxJQUFJLENBQUMsZUFBZSxDQUFDLGNBQWMsQ0FBQyxzREFBc0QsQ0FBQyxDQUFDO1lBQ2hHLENBQUM7WUFDRCxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFdBQVcsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztnQkFDMUMsR0FBRyxDQUFDLGdCQUFnQixDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxFQUFFLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDMUcsQ0FBQztRQUNMLENBQUM7UUFDRCxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFlBQVksS0FBSyxJQUFJLENBQUMscUJBQXFCLENBQUMsQ0FBQyxDQUFDO1lBRXhELFNBQVMsR0FBRyxVQUFVLENBQUM7UUFDM0IsQ0FBQztRQUVELEdBQUcsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDeEIsQ0FBQztJQUNMLHFCQUFDO0FBQUQsQ0EzT0EsQUEyT0MsSUFBQTtBQTNPWSx3Q0FBYzs7Ozs7Ozs7Ozs7Ozs7O0FDRjNCLGlEQUFnRDtBQUNoRCxtQ0FBa0M7QUFJbEMsMENBQXdDO0FBQ3hDLGlEQUFpSTtBQUVqSSx3RUFBZ0Y7QUFDaEYsNERBQTBEO0FBQzFELHVDQUE0QztBQUM1QywyREFBd0Q7QUFFeEQ7SUFBa0MsZ0NBQVU7SUFnQ3hDLHNCQUFZLEtBQXVCLEVBQUUsT0FBdUI7UUFBNUQsWUFDSSxpQkFBTyxTQXVCVjtRQTlCZ0IsZUFBUyxHQUFrQjtZQUN4Qyx3QkFBd0IsRUFBRSxJQUFJO1lBQzlCLFVBQVUsRUFBRSxLQUFLO1lBQ2pCLEtBQUssRUFBRSxLQUFLO1NBQ2YsQ0FBQztRQU1FLElBQUksSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUdkLElBQUksQ0FBQztZQUFDLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQztRQUFDLENBQUM7UUFDN0QsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFHYixLQUFJLENBQUMsT0FBTyxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsRUFBRSxFQUFFLEtBQUksQ0FBQyxTQUFTLEVBQUUsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBRWhFLEtBQUksQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDO1FBQ3BCLEtBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSx3QkFBVSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3pDLEtBQUksQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLHdCQUFVLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxLQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxLQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ3hFLEtBQUksQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLHdCQUFVLENBQUMsS0FBSyxDQUFDLFlBQVksRUFBRSxLQUFJLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxLQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ3BGLEtBQUksQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLHdCQUFVLENBQUMsS0FBSyxDQUFDLFlBQVksRUFBRSxLQUFJLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxLQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ3BGLEtBQUksQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLHdCQUFVLENBQUMsS0FBSyxDQUFDLFlBQVksRUFBRSxLQUFJLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxLQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ3BGLEtBQUksQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLHdCQUFVLENBQUMsS0FBSyxDQUFDLFlBQVksRUFBRSxLQUFJLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxLQUFJLENBQUMsQ0FBQyxDQUFDO1FBRXBGLEtBQUksQ0FBQyxpQkFBaUIsR0FBRyxLQUFJLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLEtBQUksQ0FBQyxDQUFDO1FBRTNELEtBQUksQ0FBQyxvQkFBb0IsRUFBRSxDQUFDOztJQUNoQyxDQUFDO0lBRU8sa0NBQVcsR0FBbkIsVUFBb0IsR0FBVztRQUMzQixJQUFJLENBQUMsU0FBUyxHQUFHLG1CQUFXLENBQUMsR0FBRyxDQUFDLENBQUM7UUFFbEMsSUFBSSxDQUFDLGdCQUFnQixHQUFHLEtBQUssQ0FBQztRQUM5QixJQUFJLENBQUMsZUFBZSxHQUFHLElBQUksQ0FBQztRQUU1QixJQUFJLENBQUMsTUFBTSxDQUFDLG1CQUFtQixDQUFDLGdCQUFnQixFQUFFLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1FBQzFFLElBQUksQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsZ0JBQWdCLEVBQUUsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFDdkUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsZ0JBQWdCLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUd6RixJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDMUMsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBRXBDLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxJQUFJLHFDQUFnQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUUzRCxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN6QixJQUFJLENBQUMsaUJBQWlCLEdBQUcsSUFBSSxxQ0FBZ0IsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUMvRSxDQUFDO1FBSUQsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sS0FBSyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7WUFDeEMsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLDBCQUFXLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ25HLENBQUM7UUFFRCxJQUFJLENBQUMsSUFBSSxHQUFHLEdBQUcsQ0FBQztRQUNoQixJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7SUFDMUIsQ0FBQztJQUVNLDJCQUFJLEdBQVgsVUFBWSxJQUF5QjtRQUNqQyxJQUFJLEdBQUcsR0FBVyxJQUFJLENBQUM7UUFDdkIsSUFBSSxnQkFBZ0IsR0FBVyxJQUFJLENBQUM7UUFFcEMsRUFBRSxDQUFDLENBQUMsT0FBTyxJQUFJLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQztZQUMzQixHQUFHLEdBQUcsSUFBYyxDQUFDO1FBQ3pCLENBQUM7UUFDRCxJQUFJLENBQUMsQ0FBQztZQUNGLEdBQUcsR0FBSSxJQUFtQixDQUFDLEdBQUcsQ0FBQztZQUMvQixFQUFFLENBQUMsQ0FBRSxJQUFtQixDQUFDLHVCQUF1QixJQUFJLElBQUksQ0FBQyxDQUFDLENBQUM7Z0JBQ3ZELGdCQUFnQixHQUFJLElBQW1CLENBQUMsdUJBQXVCLENBQUM7WUFDcEUsQ0FBQztRQUNMLENBQUM7UUFFRCxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBRXRCLEVBQUUsQ0FBQyxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQztZQUVuQixPQUFPLENBQUMsR0FBRyxDQUFDLHVCQUF1QixDQUFDLENBQUM7WUFDckMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBQ2xELENBQUM7UUFDRCxJQUFJLENBQUMsQ0FBQztZQUNGLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDdkIsQ0FBQztJQUNMLENBQUM7SUFFTSw4QkFBTyxHQUFkO1FBQ0ksSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLEdBQUcsSUFBSSxDQUFDO0lBQzNCLENBQUM7SUFFTywyQ0FBb0IsR0FBNUI7UUFJSSxJQUFNLHFCQUFxQixHQUFHLE1BQU0sQ0FBQyx3QkFBd0IsQ0FBQyxnQkFBZ0IsQ0FBQyxTQUFTLEVBQUUsYUFBYSxDQUFDLENBQUM7UUFDekcsRUFBRSxDQUFDLENBQUMscUJBQXFCLENBQUMsQ0FBQyxDQUFDO1lBQ3hCLElBQU0sZ0JBQWMsR0FBRyxxQkFBcUIsQ0FBQyxHQUFHLENBQUM7WUFDakQsSUFBTSxnQkFBYyxHQUFHLHFCQUFxQixDQUFDLEdBQUcsQ0FBQztZQUVqRCxJQUFJLE1BQUksR0FBRyxJQUFJLENBQUM7WUFFaEIsTUFBTSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLGFBQWEsRUFBRTtnQkFDOUMsR0FBRyxFQUFFO29CQUNELE1BQU0sQ0FBQyxnQkFBYyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDdEMsQ0FBQztnQkFDRCxHQUFHLEVBQUUsVUFBVSxHQUFHO29CQUNkLEVBQUUsQ0FBQyxDQUFDLE1BQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7d0JBQ2pCLGdCQUFjLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7b0JBQ3RDLENBQUM7Z0JBQ0wsQ0FBQztnQkFDRCxVQUFVLEVBQUUsS0FBSztnQkFDakIsWUFBWSxFQUFFLEtBQUs7YUFDdEIsQ0FBQyxDQUFDO1FBQ1AsQ0FBQztJQUNMLENBQUM7SUFPRCw4QkFBTyxHQUFQO1FBQ0ksRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLHdCQUF3QixDQUFDLENBQUMsQ0FBQztZQUN6QyxNQUFNLENBQUMsSUFBSSxDQUFDO1FBQ2hCLENBQUM7UUFFRCxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDO0lBQzVCLENBQUM7SUFFTyxvQ0FBYSxHQUFyQixVQUFzQixHQUFXO1FBRTdCLElBQUksS0FBSyxHQUFHLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNoRCxNQUFNLENBQUMsS0FBSyxJQUFJLGtCQUFrQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDckUsQ0FBQztJQUVPLGlDQUFVLEdBQWxCLFVBQW1CLEdBQVc7UUFDMUIsSUFBSSxJQUFJLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN2QyxJQUFJLENBQUMsWUFBWSxDQUFDLE1BQU0sRUFBRSxHQUFHLENBQUMsQ0FBQztRQUUvQixNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQztJQUN6QixDQUFDO0lBRU8sbUNBQVksR0FBcEIsVUFBcUIsR0FBVztRQUM1QixJQUFNLElBQUksR0FBRyxHQUFHLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDL0IsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztJQUNoRixDQUFDO0lBRU8sd0NBQWlCLEdBQXpCO1FBQ0ksRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQztZQUNwQyxJQUFJLENBQUMsYUFBYSxHQUFHLE1BQU0sQ0FBQztRQUNoQyxDQUFDO1FBQUMsSUFBSSxDQUFDLENBQUM7WUFDSixJQUFJLENBQUMsYUFBYSxHQUFHLEtBQUssQ0FBQztRQUMvQixDQUFDO1FBRUQsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDO1lBQ3pCLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxJQUFJLENBQUM7WUFDN0IsaUJBQU0sSUFBSSxZQUFDLGVBQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUM3QixDQUFDO0lBQ0wsQ0FBQztJQUVELHNCQUFXLHFCQUFLO2FBQWhCO1lBQ0ksTUFBTSxDQUFDLGVBQU0sQ0FBQztRQUNsQixDQUFDOzs7T0FBQTtJQUVNLGlDQUFVLEdBQWpCLFVBQWtCLE1BQWUsRUFBRSxFQUFXLEVBQUUsTUFBZSxFQUFFLE9BQWdCO0lBRWpGLENBQUM7SUFFTSxtQ0FBWSxHQUFuQixVQUFvQixJQUFZLEVBQUUsSUFBdUI7UUFFckQsTUFBTSxDQUFDLElBQUksQ0FBQztJQUNoQixDQUFDO0lBRUQsc0JBQUkscUNBQVc7YUFBZjtZQUNJLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQztRQUNuQyxDQUFDOzs7T0FBQTtJQUVELHNCQUFJLHNDQUFZO2FBQWhCO1lBQ0ksSUFBSSxZQUFZLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQztZQUNuQyxFQUFFLENBQUMsQ0FBQyxZQUFZLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQztnQkFDdkIsTUFBTSxDQUFDLFFBQVEsQ0FBQyxZQUFZLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDckMsQ0FBQztZQUNELE1BQU0sQ0FBQyxDQUFDLENBQUM7UUFFYixDQUFDO2FBRUQsVUFBaUIsRUFBVTtZQUN2QixJQUFJLFdBQVcsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDO1lBRW5DLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsV0FBVyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO2dCQUMxQyxFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7b0JBQ3JDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDO29CQUM5QixNQUFNLENBQUM7Z0JBQ1gsQ0FBQztZQUNMLENBQUM7UUFDTCxDQUFDOzs7T0FYQTtJQWFELHNCQUFJLG9DQUFVO2FBQWQ7WUFDSSxJQUFJLFdBQVcsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDO1lBRW5DLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsV0FBVyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO2dCQUMxQyxFQUFFLENBQUMsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztvQkFDekIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDMUIsQ0FBQztZQUNMLENBQUM7WUFFRCxNQUFNLENBQUMsSUFBSSxDQUFDO1FBQ2hCLENBQUM7OztPQUFBO0lBRUQsc0JBQUksZ0NBQU07YUFBVjtZQUNJLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDO1FBQ3hCLENBQUM7OztPQUFBO0lBRUQsc0JBQUksbUNBQVM7YUFBYjtZQUNJLE1BQU0sQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDO1FBQzNCLENBQUM7OztPQUFBO0lBRUQsc0JBQUksc0NBQVk7YUFBaEI7WUFDSSxNQUFNLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQztRQUM5QixDQUFDOzs7T0FBQTtJQUVELHNCQUFJLGtDQUFRO2FBQVo7WUFDSSxNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUM7UUFDaEMsQ0FBQzs7O09BQUE7SUFFRCxzQkFBSSw0Q0FBa0I7YUFBdEI7WUFDSSxNQUFNLENBQUMsS0FBSyxDQUFDO1FBQ2pCLENBQUM7OztPQUFBO0lBRUQsc0JBQUksbUNBQVM7YUFBYjtZQUNJLE1BQU0sQ0FBQyxjQUFjLENBQUM7UUFDMUIsQ0FBQzs7O09BQUE7SUFFTyxnQ0FBUyxHQUFqQixVQUFrQixLQUFrQjtRQUNoQyxpQkFBTSxJQUFJLFlBQUMsZUFBTSxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBQztJQUNyQyxDQUFDO0lBRU8sc0NBQWUsR0FBdkIsVUFBd0IsS0FBd0I7UUFDNUMsaUJBQU0sSUFBSSxZQUFDLGVBQU0sQ0FBQyxZQUFZLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDM0MsQ0FBQztJQUVPLHNDQUFlLEdBQXZCLFVBQXdCLEtBQXdCO1FBQzVDLGlCQUFNLElBQUksWUFBQyxlQUFNLENBQUMsWUFBWSxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQzNDLENBQUM7SUFFTyxzQ0FBZSxHQUF2QixVQUF3QixLQUF3QjtRQUM1QyxpQkFBTSxJQUFJLFlBQUMsZUFBTSxDQUFDLFlBQVksRUFBRSxLQUFLLENBQUMsQ0FBQztJQUMzQyxDQUFDO0lBRU8seUNBQWtCLEdBQTFCLFVBQTJCLEtBQWlCO1FBQ3hDLGlCQUFNLElBQUksWUFBQyxlQUFNLENBQUMsZUFBZSxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQzlDLENBQUM7SUFFTyxzQ0FBZSxHQUF2QixVQUF3QixLQUFpQjtRQUF6QyxpQkF1QkM7UUF0QkcsaUJBQU0sSUFBSSxZQUFDLGVBQU0sQ0FBQyxZQUFZLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFdkMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDO1lBQzFCLE1BQU0sQ0FBQztRQUNYLENBQUM7UUFFRCxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsZUFBZSxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUM7WUFFaEMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLElBQUksRUFBRSxVQUFDLFNBQW9CO2dCQUN6RSxLQUFJLENBQUMsZUFBZSxHQUFHLEtBQUssQ0FBQyxPQUFPLENBQUM7Z0JBQ3JDLEtBQUksQ0FBQyxtQkFBbUIsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBQ25ELENBQUMsQ0FBQyxDQUFDO1FBQ1AsQ0FBQztRQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsZUFBZSxLQUFLLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQ2hELElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBRSxJQUFJLEVBQUUsVUFBQyxnQkFBMkI7Z0JBQ3ZGLEtBQUksQ0FBQyxpQkFBaUIsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUUsVUFBQyxZQUF1QjtvQkFDNUUsS0FBSSxDQUFDLGVBQWUsR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDO29CQUNyQyxLQUFJLENBQUMsc0JBQXNCLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxnQkFBZ0IsRUFBRSxZQUFZLENBQUMsQ0FBQztnQkFDM0UsQ0FBQyxDQUFDLENBQUM7WUFDUCxDQUFDLENBQUMsQ0FBQztRQUNQLENBQUM7UUFBQyxJQUFJLENBQUMsQ0FBQztRQUVSLENBQUM7SUFDTCxDQUFDO0lBRU8sMENBQW1CLEdBQTNCLFVBQTRCLEdBQWlCLEVBQUUsU0FBb0I7UUFDL0QsSUFBSSxPQUFPLEdBQVksU0FBUyxDQUFDO1FBRWpDLEVBQUUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQ2pCLE9BQU8sR0FBRztnQkFDTixFQUFFLEVBQUUsU0FBUyxDQUFDLEtBQUs7Z0JBQ25CLEtBQUssRUFBRSxDQUFDO2dCQUNSLFNBQVMsRUFBRSxHQUFHLENBQUMsU0FBUztnQkFDeEIsT0FBTyxFQUFFLEdBQUcsQ0FBQyxTQUFTLEdBQUcsU0FBUyxDQUFDLFFBQVE7Z0JBQzNDLElBQUksRUFBRSxJQUFJO2FBQ2IsQ0FBQztZQUVGLElBQUksUUFBUSxHQUFjLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDcEMsSUFBSSxDQUFDLGVBQWUsR0FBRyxJQUFJLGtCQUFPLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDN0MsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUM7WUFFdkIsaUJBQU0sSUFBSSxZQUFDLGVBQU0sQ0FBQyxZQUFZLEVBQUUsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDO1lBQ3hFLGlCQUFNLElBQUksWUFBQyxlQUFNLENBQUMsY0FBYyxFQUFFLEVBQUUsT0FBTyxFQUFFLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQyxDQUFDO1FBQ3pFLENBQUM7UUFBQyxJQUFJLENBQUMsQ0FBQztZQUNKLElBQUksQ0FBQyxVQUFVLEdBQUcsS0FBSyxDQUFDO1lBR3hCLGlCQUFNLElBQUksWUFBQyxlQUFNLENBQUMsWUFBWSxFQUFFLEVBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQztRQUM5RSxDQUFDO0lBQ0wsQ0FBQztJQUVPLDZDQUFzQixHQUE5QixVQUErQixHQUFpQixFQUFFLGFBQXdCLEVBQUUsUUFBbUI7UUFFM0YsSUFBSSxDQUFDLFVBQVUsR0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDO1FBRWhDLEVBQUUsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUM7WUFFN0MsaUJBQU0sSUFBSSxZQUFDLGVBQU0sQ0FBQyxXQUFXLEVBQUUsRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLGVBQWUsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxFQUFFLGFBQWEsRUFBRSxDQUFDLENBQUM7WUFDeEcsaUJBQU0sSUFBSSxZQUFDLGVBQU0sQ0FBQyxhQUFhLEVBQUUsRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDLENBQUM7UUFDeEUsQ0FBQztRQUFDLElBQUksQ0FBQyxDQUFDO1lBRUosaUJBQU0sSUFBSSxZQUFDLGVBQU0sQ0FBQyxXQUFXLEVBQUUsRUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxhQUFhLEVBQUUsQ0FBQyxDQUFDO1FBQ2pGLENBQUM7UUFFRCxJQUFJLENBQUMsbUJBQW1CLENBQUMsR0FBRyxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQzVDLENBQUM7SUFFTSx5Q0FBa0IsR0FBekIsVUFBMEIsZ0JBQTRCO0lBRXRELENBQUM7SUFFRCxzQkFBSSxpQ0FBTzthQUFYO1lBQ0ksTUFBTSxDQUFDLGdCQUFnQixDQUFDO1FBQzVCLENBQUM7OztPQUFBO0lBQ0wsbUJBQUM7QUFBRCxDQW5XQSxBQW1XQyxDQW5XaUMsdUJBQVUsR0FtVzNDO0FBbldZLG9DQUFZOzs7QUNUekIsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDMUIsTUFBTSxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUMsU0FBUyxFQUFFLE1BQU0sRUFBRTtRQUM3QyxLQUFLLEVBQUUsVUFBUyxTQUFhO1lBRTNCLEVBQUUsQ0FBQyxDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDO2dCQUNqQixNQUFNLElBQUksU0FBUyxDQUFDLCtCQUErQixDQUFDLENBQUM7WUFDdkQsQ0FBQztZQUVELElBQUksQ0FBQyxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUdyQixJQUFJLEdBQUcsR0FBRyxDQUFDLENBQUMsTUFBTSxLQUFLLENBQUMsQ0FBQztZQUd6QixFQUFFLENBQUMsQ0FBQyxPQUFPLFNBQVMsS0FBSyxVQUFVLENBQUMsQ0FBQyxDQUFDO2dCQUNwQyxNQUFNLElBQUksU0FBUyxDQUFDLDhCQUE4QixDQUFDLENBQUM7WUFDdEQsQ0FBQztZQUdELElBQUksT0FBTyxHQUFHLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUczQixJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7WUFHVixPQUFPLENBQUMsR0FBRyxHQUFHLEVBQUUsQ0FBQztnQkFLZixJQUFJLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ2xCLEVBQUUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUMxQyxNQUFNLENBQUMsTUFBTSxDQUFDO2dCQUNoQixDQUFDO2dCQUVELENBQUMsRUFBRSxDQUFDO1lBQ04sQ0FBQztZQUdELE1BQU0sQ0FBQyxTQUFTLENBQUM7UUFDbkIsQ0FBQztLQUNGLENBQUMsQ0FBQztBQUNMLENBQUM7OztBQzNDRCxFQUFFLENBQUMsQ0FBQyxPQUFPLE1BQU0sQ0FBQyxNQUFNLElBQUksVUFBVSxDQUFDLENBQUMsQ0FBQztJQUN2QyxDQUFDO1FBQ0MsTUFBTSxDQUFDLE1BQU0sR0FBRyxVQUFVLE1BQVc7WUFDbkMsWUFBWSxDQUFDO1lBRWIsRUFBRSxDQUFDLENBQUMsTUFBTSxLQUFLLFNBQVMsSUFBSSxNQUFNLEtBQUssSUFBSSxDQUFDLENBQUMsQ0FBQztnQkFDNUMsTUFBTSxJQUFJLFNBQVMsQ0FBQyw0Q0FBNEMsQ0FBQyxDQUFDO1lBQ3BFLENBQUM7WUFFRCxJQUFJLE1BQU0sR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDNUIsR0FBRyxDQUFDLENBQUMsSUFBSSxLQUFLLEdBQUcsQ0FBQyxFQUFFLEtBQUssR0FBRyxTQUFTLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUM7Z0JBQ3RELElBQUksTUFBTSxHQUFHLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDOUIsRUFBRSxDQUFDLENBQUMsTUFBTSxLQUFLLFNBQVMsSUFBSSxNQUFNLEtBQUssSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDNUMsR0FBRyxDQUFDLENBQUMsSUFBSSxPQUFPLElBQUksTUFBTSxDQUFDLENBQUMsQ0FBQzt3QkFDM0IsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7NEJBQ25DLE1BQU0sQ0FBQyxPQUFPLENBQUMsR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUM7d0JBQ3BDLENBQUM7b0JBQ0gsQ0FBQztnQkFDSCxDQUFDO1lBQ0gsQ0FBQztZQUNELE1BQU0sQ0FBQyxNQUFNLENBQUM7UUFDaEIsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLEVBQUUsQ0FBQztBQUNQLENBQUM7OztBQ3hCRCxDQUFDO0lBQ1MsTUFBTyxDQUFDLE1BQU0sR0FBUyxNQUFPLENBQUMsTUFBTSxJQUFVLE1BQU8sQ0FBQyxZQUFZLENBQUM7QUFDOUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQzs7Ozs7QUNKTCw4QkFBNEI7QUFDNUIsNkJBQTJCO0FBQzNCLDRCQUEwQjtBQUUxQixxREFBbUQ7QUFDbkQsaURBQStDO0FBRy9DO0lBQ0ksSUFBSSxDQUFDO1FBQ0QsSUFBSSxLQUFLLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUU1QyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztZQUNwQixNQUFNLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQywrQkFBK0IsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNyRSxDQUFDO0lBQ0wsQ0FBQztJQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDVCxNQUFNLENBQUMsS0FBSyxDQUFDO0lBQ2pCLENBQUM7SUFFRCxNQUFNLENBQUMsS0FBSyxDQUFDO0FBQ2pCLENBQUM7QUFFRDtJQUNJLEVBQUUsQ0FBQyxDQUFDLGFBQWEsSUFBSSxNQUFNLElBQUksV0FBVyxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUM7UUFDekQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxlQUFlLENBQUMsMkNBQTJDLENBQUMsQ0FBQztJQUNwRixDQUFDO0lBRUQsTUFBTSxDQUFDLEtBQUssQ0FBQztBQUNqQixDQUFDO0FBRUQ7SUFFSSxJQUFNLE9BQU8sR0FBRyxRQUFRLENBQUMsb0JBQW9CLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDeEQsRUFBRSxDQUFDLENBQUMsT0FBTyxJQUFJLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1FBQzVCLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsT0FBTyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ3RDLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsb0JBQW9CLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3JHLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDdEIsQ0FBQztRQUNMLENBQUM7SUFDTCxDQUFDO0lBRUQsTUFBTSxDQUFDLFNBQVMsQ0FBQztBQUNyQixDQUFDO0FBRUQsSUFBSSxvQkFBb0IsR0FBRyxJQUFJLENBQUM7QUFFaEMsa0NBQWtDLEtBQXVCLEVBQUUsT0FBdUIsRUFBRSxRQUFtQztJQUduSCxJQUFJLEdBQUcsR0FBRyxhQUFhLEVBQUUsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxhQUFhLEVBQUUsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLG9CQUFvQixDQUFDO0lBRzVHLElBQUksVUFBVSxHQUFHLEtBQUssQ0FBQztJQUN2QixFQUFFLENBQUMsQ0FBQyxVQUFVLElBQUksT0FBTyxXQUFXLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQztRQUNoRCxRQUFRLENBQUMsSUFBSSxnQ0FBYyxDQUFDLEtBQUssRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDO0lBQ2pELENBQUM7SUFDRCxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyx1QkFBdUIsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDckMsb0JBQW9CLEdBQUcsS0FBSyxDQUFDO1FBQzdCLGVBQWUsQ0FBQyxHQUFHLEVBQUU7WUFDakIsb0JBQW9CLEdBQUcsSUFBSSxDQUFDO1lBQzVCLFFBQVEsQ0FBQyxJQUFJLGdDQUFjLENBQUMsS0FBSyxFQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUM7UUFDakQsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0lBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQztRQUM5QixRQUFRLENBQUMsSUFBSSxnQ0FBYyxDQUFDLEtBQUssRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDO0lBQ2pELENBQUM7SUFBQyxJQUFJLENBQUMsQ0FBQztRQUdKLFVBQVUsQ0FBQztZQUNQLHdCQUF3QixDQUFDLEtBQUssRUFBRSxPQUFPLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDdkQsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBQ1osQ0FBQztBQUNMLENBQUM7QUFFRCx5QkFBeUIsR0FBVyxFQUFFLFFBQW9CO0lBQ3RELElBQUksSUFBSSxHQUFHLFFBQVEsQ0FBQyxvQkFBb0IsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNwRCxJQUFJLE1BQU0sR0FBRyxRQUFRLENBQUMsYUFBYSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBRTlDLE1BQU0sQ0FBQyxJQUFJLEdBQUcsaUJBQWlCLENBQUM7SUFDaEMsTUFBTSxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7SUFFakIsTUFBTSxDQUFDLE1BQU0sR0FBRztRQUNaLFFBQVEsRUFBRSxDQUFDO0lBQ2YsQ0FBQyxDQUFDO0lBRUYsSUFBSSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUM3QixDQUFDO0FBRUQsaUNBQWlDLEdBQVc7SUFDeEMsSUFBSSxPQUFPLEdBQUcsUUFBUSxDQUFDLG9CQUFvQixDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ3RELEVBQUUsQ0FBQyxDQUFDLE9BQU8sSUFBSSxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztRQUM1QixHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUN0QyxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQ3pCLE1BQU0sQ0FBQyxJQUFJLENBQUM7WUFDaEIsQ0FBQztRQUNMLENBQUM7SUFDTCxDQUFDO0lBRUQsTUFBTSxDQUFDLEtBQUssQ0FBQztBQUNqQixDQUFDO0FBRUQsOEJBQThCLEtBQXVCLEVBQUUsT0FBWSxFQUFFLFFBQW1DO0lBRXBHLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7UUFDL0IsRUFBRSxDQUFDLENBQUMseUJBQXlCLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFFOUIsUUFBUSxDQUFDLElBQUksNEJBQVksQ0FBQyxLQUFLLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQztZQUMzQyxNQUFNLENBQUM7UUFDWCxDQUFDO1FBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLHVCQUF1QixFQUFFLENBQUMsQ0FBQyxDQUFDO1lBRW5DLHdCQUF3QixDQUFDLEtBQUssRUFBRSxPQUFPLEVBQUUsUUFBUSxDQUFDLENBQUM7WUFDbkQsTUFBTSxDQUFDO1FBQ1gsQ0FBQztJQUNMLENBQUM7SUFBQyxJQUFJLENBQUMsQ0FBQztRQUNKLEVBQUUsQ0FBQyxDQUFDLHVCQUF1QixFQUFFLENBQUMsQ0FBQyxDQUFDO1lBRTVCLHdCQUF3QixDQUFDLEtBQUssRUFBRSxPQUFPLEVBQUUsUUFBUSxDQUFDLENBQUM7WUFDbkQsTUFBTSxDQUFDO1FBQ1gsQ0FBQztRQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyx5QkFBeUIsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUVyQyxRQUFRLENBQUMsSUFBSSw0QkFBWSxDQUFDLEtBQUssRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQzNDLE1BQU0sQ0FBQztRQUNYLENBQUM7SUFDTCxDQUFDO0lBQ0QsT0FBTyxDQUFDLElBQUksQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDO0lBQzNDLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQztBQUN4QixDQUFDO0FBRUssTUFBTyxDQUFDLG9CQUFvQixHQUFHLG9CQUFvQixDQUFDO0FBQ3BELE1BQU8sQ0FBQyxjQUFjLEdBQUcsZ0NBQWMsQ0FBQzs7Ozs7QUNoSTlDLDJDQUF5QztBQUt6QztJQUdJO1FBQ0ksSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLHNCQUFTLEVBQUUsQ0FBQztJQUN0QyxDQUFDO0lBRUQsdUJBQUUsR0FBRixVQUFHLEtBQWEsRUFBRSxRQUFhO1FBQzNCLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUM3RCxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDOUMsQ0FBQztJQUVELHdCQUFHLEdBQUgsVUFBSSxLQUFhLEVBQUUsUUFBYTtRQUFoQyxpQkFnQkM7UUFmRyxJQUFJLFNBQVMsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUMzQyxJQUFJLEtBQWEsQ0FBQztRQUVsQixFQUFFLENBQUMsQ0FBQyxTQUFTLElBQUksU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7WUFDaEMsS0FBSyxHQUFHLFNBQVMsQ0FBQyxNQUFNLENBQUMsVUFBQyxDQUFTLEVBQUUsUUFBYSxFQUFFLEtBQWE7Z0JBQzdELE1BQU0sQ0FBQyxDQUFDLEtBQUksQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLElBQUksUUFBUSxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDakYsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFUCxFQUFFLENBQUMsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNiLFNBQVMsQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUMzQixJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsU0FBUyxDQUFDLENBQUM7Z0JBQ3RDLE1BQU0sQ0FBQyxJQUFJLENBQUM7WUFDaEIsQ0FBQztRQUNMLENBQUM7UUFDRCxNQUFNLENBQUMsS0FBSyxDQUFDO0lBQ2pCLENBQUM7SUFFRCx5QkFBSSxHQUFKLFVBQUssS0FBYTtRQUFFLGNBQWM7YUFBZCxVQUFjLEVBQWQscUJBQWMsRUFBZCxJQUFjO1lBQWQsNkJBQWM7O1FBQzlCLElBQUksU0FBUyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBRTNDLEVBQUUsQ0FBQyxDQUFDLFNBQVMsSUFBSSxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztZQUNoQyxTQUFTLENBQUMsT0FBTyxDQUFDLFVBQUMsUUFBYTtnQkFDNUIsUUFBUSxlQUFJLElBQUksRUFBRTtZQUN0QixDQUFDLENBQUMsQ0FBQztZQUNILE1BQU0sQ0FBQyxJQUFJLENBQUM7UUFDaEIsQ0FBQztRQUNELE1BQU0sQ0FBQyxLQUFLLENBQUM7SUFDakIsQ0FBQztJQUVPLGdDQUFXLEdBQW5CLFVBQW9CLEdBQVE7UUFDeEIsTUFBTSxDQUFDLE9BQU8sR0FBRyxJQUFJLFVBQVUsSUFBSSxLQUFLLENBQUM7SUFDN0MsQ0FBQztJQUNMLGlCQUFDO0FBQUQsQ0E3Q0EsQUE2Q0MsSUFBQTtBQTdDWSxnQ0FBVTs7Ozs7QUNMdkIsMkNBQXlDO0FBRXpDO0lBSUksb0JBQVksUUFBbUI7UUFDM0IsSUFBSSxDQUFDLFNBQVMsR0FBRyxRQUFRLENBQUM7UUFDMUIsSUFBSSxDQUFDLFNBQVMsR0FBRyxFQUFFLENBQUM7UUFDcEIsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO0lBQ3pCLENBQUM7SUFFRCxnQ0FBVyxHQUFYLFVBQVksSUFBWTtRQUNwQixJQUFJLEtBQUssR0FBRyxJQUFJLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDekMsTUFBTSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDcEMsQ0FBQztJQUVELGlDQUFZLEdBQVosVUFBYSxLQUFhO1FBQ3RCLEVBQUUsQ0FBQyxDQUFDLEtBQUssSUFBSSxDQUFDLElBQUksS0FBSyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztZQUM5QyxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNqQyxDQUFDO1FBRUQsTUFBTSxDQUFDLFNBQVMsQ0FBQztJQUNyQixDQUFDO0lBRUQsc0NBQWlCLEdBQWpCLFVBQWtCLElBQVk7UUFDMUIsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQzdDLElBQUksT0FBTyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDaEMsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLFNBQVMsSUFBSSxJQUFJLElBQUksSUFBSSxJQUFJLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO2dCQUN2RCxNQUFNLENBQUMsQ0FBQyxDQUFDO1lBQ2IsQ0FBQztRQUNMLENBQUM7UUFFRCxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDZCxDQUFDO0lBRUQsc0JBQUksOEJBQU07YUFBVjtZQUNJLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQztRQUNqQyxDQUFDOzs7T0FBQTtJQUVELHNCQUFJLGdDQUFRO2FBQVo7WUFDSSxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQztRQUMxQixDQUFDOzs7T0FBQTtJQUVELHNCQUFJLHVDQUFlO2FBQW5CO1lBQ0ksTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUN2RCxDQUFDOzs7T0FBQTtJQUVNLGVBQUksR0FBWCxVQUFZLE9BQWdCO1FBQ3hCLE1BQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSxLQUFLLElBQUksQ0FBQztJQUNqQyxDQUFDO0lBRU0sb0JBQVMsR0FBaEIsVUFBaUIsT0FBZ0I7UUFDN0IsTUFBTSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEtBQUssU0FBUyxDQUFDO0lBQ3RDLENBQUM7SUFFTyxrQ0FBYSxHQUFyQjtRQUNJLElBQUksR0FBRyxHQUFjLEVBQUUsQ0FBQztRQUV4QixHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDN0MsT0FBTyxDQUFDLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLElBQUksVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztnQkFDckUsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzVCLENBQUMsRUFBRSxDQUFBO1lBQ1AsQ0FBQztZQUVELEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDakIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSxrQkFBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQ3RDLEdBQUcsR0FBRyxFQUFFLENBQUM7WUFDYixDQUFDO1FBQ0wsQ0FBQztJQUNMLENBQUM7SUFFRCw4QkFBUyxHQUFULFVBQVUsSUFBWTtRQUNsQixHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDN0MsSUFBSSxPQUFPLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNoQyxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDekIsTUFBTSxDQUFDLElBQUksQ0FBQztZQUNoQixDQUFDO1FBQ0wsQ0FBQztRQUVELE1BQU0sQ0FBQyxLQUFLLENBQUM7SUFDakIsQ0FBQztJQUVELCtCQUFVLEdBQVYsVUFBVyxJQUFZO1FBQ25CLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxVQUFDLE9BQWdCO1lBQ3hDLE1BQU0sQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2xDLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztJQUVELHVDQUFrQixHQUFsQixVQUFtQixLQUFhLEVBQUUsR0FBVztRQUN6QyxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsVUFBQyxPQUFnQjtZQUMxQyxNQUFNLENBQUMsS0FBSyxJQUFJLE9BQU8sQ0FBQyxTQUFTLElBQUksT0FBTyxDQUFDLE9BQU8sSUFBSSxHQUFHLENBQUM7UUFDaEUsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0lBQ0wsaUJBQUM7QUFBRCxDQTVGQSxBQTRGQyxJQUFBO0FBNUZZLGdDQUFVOzs7OztBQ0Z2QjtJQUdJO1FBQ0ksSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLE1BQU0sRUFBRSxDQUFDO0lBQzdCLENBQUM7SUFFRCxzQkFBSSwyQkFBSTthQUFSO1lBQ0ksTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQztRQUN6QyxDQUFDOzs7T0FBQTtJQUVELHVCQUFHLEdBQUgsVUFBSSxHQUFXO1FBQ1gsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ3pDLENBQUM7SUFFRCx1QkFBRyxHQUFILFVBQUksR0FBVztRQUNYLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQzFCLENBQUM7SUFFRCx1QkFBRyxHQUFILFVBQUksR0FBVyxFQUFFLEtBQVE7UUFDckIsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxLQUFLLENBQUM7SUFDM0IsQ0FBQztJQUVELHlCQUFLLEdBQUw7UUFDSSxJQUFNLElBQUksR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNwQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNuQyxJQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDcEIsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUM7WUFDdEIsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQzFCLENBQUM7SUFDTCxDQUFDO0lBQ0wsZ0JBQUM7QUFBRCxDQS9CQSxBQStCQyxJQUFBO0FBL0JZLDhCQUFTOzs7OztBQ0F0QixpQ0FBc0M7QUFVdEMsc0JBQTZCLElBQVksRUFBRSxRQUFvQixFQUFFLGdCQUFrQyxFQUFFLGFBQTBDO0lBQTFDLDhCQUFBLEVBQUEsdUJBQTBDO0lBQzNJLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxJQUFJLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMxQixJQUFJLEdBQUcsQ0FBQyxDQUFDO0lBQ2IsQ0FBQztJQUVELEVBQUUsQ0FBQyxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQztRQUNuQixJQUFNLE9BQU8sR0FBRyxRQUFRLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzNDLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7WUFDVixJQUFNLEtBQUssR0FBRyxnQkFBZ0IsQ0FBQyxZQUFZLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ3hELEVBQUUsQ0FBQyxDQUFDLEtBQUssSUFBSSxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztnQkFDeEIsSUFBTSxXQUFXLEdBQUcsY0FBYyxDQUFDLElBQUksRUFBRSxPQUFPLEVBQUUsS0FBSyxDQUFDLENBQUM7Z0JBQ3pELElBQU0sS0FBSyxHQUFHLFFBQVEsQ0FBQyxLQUFLLEVBQUUsYUFBYSxDQUFDLENBQUM7Z0JBRTdDLE1BQU0sQ0FBQztvQkFDSCxHQUFHLEVBQUUsZUFBZSxDQUFDLEtBQUssRUFBRSxXQUFXLEVBQUUsS0FBSyxDQUFDO29CQUMvQyxNQUFNLEVBQUUsS0FBSyxDQUFDLE1BQU07b0JBQ3BCLEtBQUssRUFBRSxLQUFLLENBQUMsS0FBSztpQkFDckIsQ0FBQTtZQUNMLENBQUM7UUFDTCxDQUFDO0lBQ0wsQ0FBQztJQUVELE1BQU0sQ0FBQztRQUNILEdBQUcsRUFBRSxFQUFFO1FBQ1AsTUFBTSxFQUFFLENBQUM7UUFDVCxLQUFLLEVBQUUsQ0FBQztLQUNYLENBQUM7QUFDTixDQUFDO0FBM0JELG9DQTJCQztBQUVELHlCQUF5QixLQUFnQixFQUFFLFdBQW1CLEVBQUUsS0FBWTtJQUN4RSxJQUFJLE1BQU0sR0FBRyxLQUFLLENBQUMsV0FBVyxDQUFDO0lBRS9CLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxpQkFBaUIsSUFBSSxLQUFLLENBQUMsaUJBQWlCLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztRQUM1RCxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUN0RCxJQUFNLFNBQVMsR0FBRyxLQUFLLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDN0MsRUFBRSxDQUFDLENBQUMsU0FBUyxDQUFDLEtBQUssSUFBSSxXQUFXLElBQUksV0FBVyxHQUFHLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO2dCQUNoRSxNQUFNLEdBQUcsU0FBUyxDQUFDLEdBQUcsQ0FBQztnQkFDdkIsS0FBSyxDQUFDO1lBQ1YsQ0FBQztRQUNMLENBQUM7SUFDTCxDQUFDO0lBRUQsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQztRQUNwQyxNQUFNLElBQUksR0FBRyxDQUFDO0lBQ2xCLENBQUM7SUFFRCxJQUFNLGNBQWMsR0FBRyxtQkFBVyxDQUFDLFdBQVcsQ0FBQyxDQUFDO0lBRWhELE1BQU0sQ0FBQyxLQUFHLE1BQU0sR0FBRyxLQUFLLENBQUMsTUFBTSxHQUFHLGNBQWMsU0FBTSxDQUFDO0FBQzNELENBQUM7QUFFRCxrQkFBa0IsS0FBZ0IsRUFBRSxJQUF1QjtJQUV2RCxJQUFJLEtBQUssR0FBVSxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRW5DLEVBQUUsQ0FBQyxDQUFDLElBQUksS0FBSyxPQUFPLENBQUMsQ0FBQyxDQUFDO1FBRW5CLEtBQUssR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQ2xELENBQUM7SUFFRCxNQUFNLENBQUMsS0FBSyxDQUFDO0FBQ2pCLENBQUM7QUFHRCx3QkFBd0IsSUFBWSxFQUFFLE9BQWdCLEVBQUUsS0FBZ0I7SUFDcEUsSUFBSSxXQUFXLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksR0FBRyxPQUFPLENBQUMsU0FBUyxDQUFDLEdBQUcsS0FBSyxDQUFDLGFBQWEsQ0FBQyxDQUFDO0lBQzlFLFdBQVcsSUFBSSxPQUFPLENBQUMsS0FBSyxDQUFDO0lBRTdCLEVBQUUsQ0FBQyxDQUFDLFdBQVcsR0FBRyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztRQUMvQixXQUFXLEdBQUcsS0FBSyxDQUFDLFFBQVEsQ0FBQztJQUNqQyxDQUFDO0lBRUQsTUFBTSxDQUFDLFdBQVcsQ0FBQztBQUN2QixDQUFDOzs7OztBQ25GRCxzQkFBNkIsSUFBWTtJQUNyQyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2QsSUFBSSxHQUFHLENBQUMsQ0FBQztJQUNiLENBQUM7SUFFRCxJQUFJLFFBQVEsR0FBRyxDQUFDLElBQUksR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7SUFFckMsSUFBSSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7SUFFdEIsSUFBSSxPQUFPLEdBQUcsQ0FBQyxJQUFJLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQzlCLElBQUksT0FBTyxHQUFHLENBQUMsQ0FBQyxJQUFJLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ3JDLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksR0FBRyxFQUFFLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDMUMsSUFBSSxTQUFTLEdBQUcsS0FBSyxHQUFHLENBQUMsQ0FBQztJQUUxQixJQUFJLEtBQUssR0FBRyxLQUFLLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFJLEtBQU8sQ0FBQyxDQUFDLENBQUMsS0FBRyxLQUFPLENBQUM7SUFDbEQsSUFBSSxNQUFNLEdBQUcsT0FBTyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBSSxPQUFTLENBQUMsQ0FBQyxDQUFDLEtBQUcsT0FBUyxDQUFDO0lBQ3pELElBQUksTUFBTSxHQUFHLE9BQU8sR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQUksT0FBUyxDQUFDLENBQUMsQ0FBQyxLQUFHLE9BQVMsQ0FBQztJQUV6RCxFQUFFLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO1FBQ1osTUFBTSxDQUFDLEtBQUcsUUFBUSxHQUFHLEtBQUssU0FBSSxNQUFNLFNBQUksTUFBUSxDQUFDO0lBQ3JELENBQUM7SUFBQyxJQUFJLENBQUMsQ0FBQztRQUNKLE1BQU0sQ0FBQyxLQUFHLFFBQVEsR0FBRyxNQUFNLFNBQUksTUFBUSxDQUFDO0lBQzVDLENBQUM7QUFDTCxDQUFDO0FBdkJELG9DQXVCQztBQUVELHFCQUE0QixNQUFjLEVBQUUsU0FBYTtJQUFiLDBCQUFBLEVBQUEsYUFBYTtJQUNyRCxJQUFJLEdBQUcsR0FBRyxNQUFNLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDO0lBQzVDLE9BQU8sR0FBRyxDQUFDLE1BQU0sR0FBRyxTQUFTLEVBQUUsQ0FBQztRQUM1QixHQUFHLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQztJQUNwQixDQUFDO0lBRUQsTUFBTSxDQUFDLEdBQUcsQ0FBQztBQUNmLENBQUM7QUFQRCxrQ0FPQztBQUVELHdCQUErQixVQUFrQjtJQUM3QyxNQUFNLENBQUMsSUFBSSxVQUFVLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLElBQUksTUFBTSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ25HLENBQUM7QUFGRCx3Q0FFQztBQUVELGVBQXNCLElBQWdCLEVBQUUsS0FBYSxFQUFFLEdBQVk7SUFFL0QsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDYixNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDbEMsQ0FBQztJQUVELEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDTixNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDckMsQ0FBQztJQUVELE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBQ2hDLENBQUM7QUFYRCxzQkFXQztBQUVEO0lBR0ksRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLGNBQWMsSUFBSSxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDOUIsTUFBTSxDQUFDLEtBQUssQ0FBQztJQUNqQixDQUFDO0lBSUQsSUFBSSxDQUFDO1FBRUQsTUFBTSxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBRzdDLElBQUksTUFBTSxHQUFHLE1BQU0sQ0FBQyxZQUFZLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBR3BELE1BQU0sQ0FBQyxZQUFZLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBRzFDLE1BQU0sQ0FBQyxDQUFDLE1BQU0sS0FBSyxJQUFJLENBQUMsQ0FBQztJQUM3QixDQUFDO0lBQ0QsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNQLE1BQU0sQ0FBQyxLQUFLLENBQUM7SUFDakIsQ0FBQztBQUNMLENBQUM7QUF6QkQsMERBeUJDO0FBRUQscUJBQTRCLEdBQVc7SUFDbkMsSUFBSSxDQUFDO1FBRUQsTUFBTSxDQUFDLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLFFBQVEsQ0FBQztJQUNqQyxDQUFDO0lBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFZixJQUFJLElBQUksR0FBRyxRQUFRLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ3ZDLElBQUksQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBRS9CLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDO0FBQ3pCLENBQUM7QUFWRCxrQ0FVQztBQUVEO0lBQ0ksSUFBSSxNQUFNLEdBQUcsQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNuSCxJQUFJLE1BQU0sR0FBRyxTQUFTLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztJQUN6RCxNQUFNLENBQUMsTUFBTSxJQUFJLE1BQU0sQ0FBQztBQUM1QixDQUFDO0FBSkQsb0NBSUM7QUFFRCx5QkFBZ0MsVUFBa0I7SUFDOUMsSUFBSSxNQUFNLEdBQUcsSUFBSSxXQUFXLENBQUMsVUFBVSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztJQUNwRCxJQUFJLEtBQUssR0FBRyxJQUFJLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUNwQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsTUFBTSxHQUFHLFVBQVUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxHQUFHLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1FBQzFELEtBQUssQ0FBQyxDQUFDLENBQUMsR0FBRyxVQUFVLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3hDLENBQUM7SUFDRCxNQUFNLENBQUMsS0FBSyxDQUFDO0FBQ2pCLENBQUM7QUFQRCwwQ0FPQztBQUVELHlCQUFnQyxLQUFrQjtJQUM5QyxJQUFJLFdBQVcsR0FBRyxJQUFJLFdBQVcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDaEQsTUFBTSxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxXQUFXLENBQUMsQ0FBQztBQUN4RCxDQUFDO0FBSEQsMENBR0M7QUFFRCxnQ0FBdUMsS0FBVTtJQUM3QyxJQUFJLEdBQUcsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQzdCLElBQUksU0FBUyxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUM7SUFDM0IsSUFBSSxLQUFLLEdBQUcsSUFBSSxVQUFVLENBQUMsSUFBSSxXQUFXLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztJQUV2RCxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFNBQVMsRUFBRSxDQUFDLEVBQUU7UUFDOUIsS0FBSyxDQUFDLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFakMsTUFBTSxDQUFDLEtBQUssQ0FBQztBQUNqQixDQUFDO0FBVEQsd0RBU0M7QUFFRCxnQ0FBdUMsS0FBaUI7SUFDcEQsSUFBSSxNQUFNLEdBQUcsbUVBQW1FLENBQUM7SUFDakYsSUFBSSxNQUFNLEdBQUcsRUFBRSxDQUFDO0lBQ2hCLElBQUksSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDO0lBQzdDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUVWLE9BQU8sQ0FBQyxHQUFHLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUN0QixJQUFJLEdBQUcsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDbEIsSUFBSSxHQUFHLENBQUMsR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQztRQUNsRCxJQUFJLEdBQUcsQ0FBQyxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDO1FBRWxELElBQUksR0FBRyxJQUFJLElBQUksQ0FBQyxDQUFDO1FBQ2pCLElBQUksR0FBRyxDQUFDLENBQUMsSUFBSSxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ3ZDLElBQUksR0FBRyxDQUFDLENBQUMsSUFBSSxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ3hDLElBQUksR0FBRyxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBRWpCLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDZCxJQUFJLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUNyQixDQUFDO1FBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDckIsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUNkLENBQUM7UUFDRCxNQUFNLElBQUksTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQztZQUMvQyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDbEQsQ0FBQztJQUNELE1BQU0sQ0FBQyxNQUFNLENBQUM7QUFDbEIsQ0FBQztBQXpCRCx3REF5QkM7Ozs7O0FDbEpELG9EQUFrRDtBQUNsRCxrREFBZ0Q7QUFFaEQsSUFBVyxRQVVWO0FBVkQsV0FBVyxRQUFRO0lBQ2Ysd0RBQWlCLENBQUE7SUFDakIseURBQWlCLENBQUE7SUFDakIsdUNBQVEsQ0FBQTtJQUNSLHlDQUFTLENBQUE7SUFDVCx1Q0FBUSxDQUFBO0lBQ1IseUNBQVMsQ0FBQTtJQUNULHlDQUFTLENBQUE7SUFDVCx5Q0FBUyxDQUFBO0lBQ1QsK0NBQVksQ0FBQTtBQUNoQixDQUFDLEVBVlUsUUFBUSxLQUFSLFFBQVEsUUFVbEI7QUFFRCxJQUFXLFdBVVY7QUFWRCxXQUFXLFdBQVc7SUFDbEIsOERBQWlCLENBQUE7SUFDakIsK0RBQWlCLENBQUE7SUFDakIsdUNBQUssQ0FBQTtJQUNMLHlDQUFNLENBQUE7SUFDTiwrQ0FBUyxDQUFBO0lBQ1QsdUNBQUssQ0FBQTtJQUNMLCtDQUFTLENBQUE7SUFDVCx1Q0FBSyxDQUFBO0lBQ0wscURBQVksQ0FBQTtBQUNoQixDQUFDLEVBVlUsV0FBVyxLQUFYLFdBQVcsUUFVckI7QUFnREQ7SUFzQkksbUJBQVksR0FBd0IsRUFBRSxJQUFvQjtRQUN0RCxJQUFJLENBQUMsU0FBUyxHQUFHLEdBQUcsQ0FBQyxVQUFVLElBQUksQ0FBQyxDQUFDO1FBQ3JDLElBQUksQ0FBQyxLQUFLLEdBQUcsR0FBRyxDQUFDLEtBQUssSUFBSSxDQUFDLENBQUM7UUFDNUIsSUFBSSxDQUFDLFFBQVEsR0FBRyxHQUFHLENBQUMsU0FBUyxDQUFDO1FBQzlCLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxHQUFHLENBQUMsa0JBQWtCLENBQUM7UUFDaEQsSUFBSSxDQUFDLFFBQVEsR0FBRyxHQUFHLENBQUMsU0FBUyxDQUFDO1FBQzlCLElBQUksQ0FBQyxXQUFXLEdBQUcsR0FBRyxDQUFDLFlBQVksQ0FBQztRQUNwQyxJQUFJLENBQUMsTUFBTSxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQUM7UUFDMUIsSUFBSSxDQUFDLGFBQWEsR0FBRyxHQUFHLENBQUMsU0FBUyxDQUFDO1FBQ25DLElBQUksQ0FBQyxXQUFXLEdBQUcsR0FBRyxDQUFDLFlBQVksQ0FBQztRQUNwQyxJQUFJLENBQUMsS0FBSyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUM7UUFDdkIsSUFBSSxDQUFDLEtBQUssR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxNQUFNLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQztRQUN6QixJQUFJLENBQUMsU0FBUyxHQUFHLEdBQUcsQ0FBQyxVQUFVLENBQUM7UUFDaEMsSUFBSSxDQUFDLFFBQVEsR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDO1FBQzdCLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxHQUFHLENBQUMsa0JBQWtCLENBQUM7UUFDL0MsSUFBSSxDQUFDLFdBQVcsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDO1FBQzVCLElBQUksQ0FBQyxXQUFXLEdBQUcsR0FBRyxDQUFDLFlBQVksQ0FBQztRQUNwQyxJQUFJLENBQUMsVUFBVSxHQUFHLEdBQUcsQ0FBQyxXQUFXLENBQUM7UUFDbEMsSUFBSSxDQUFDLEtBQUssR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDO1FBR3ZCLEVBQUUsQ0FBQyxDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQ2YsSUFBSSxDQUFDLElBQUksR0FBRyxHQUFHLENBQUMsS0FBSyxLQUFLLENBQUMsQ0FBQztRQUNoQyxDQUFDO1FBQUMsSUFBSSxDQUFDLENBQUM7WUFDSixJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztRQUNyQixDQUFDO1FBSUQsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7WUFDZCxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxVQUFVLElBQVcsRUFBRSxLQUFZO2dCQUNoRCxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDO1lBQ3BDLENBQUMsQ0FBQyxDQUFDO1FBQ1AsQ0FBQztRQUlELEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxpQkFBaUIsSUFBSSxJQUFJLENBQUMsaUJBQWlCLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztZQUMxRCxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztnQkFHckQsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztZQUM5RixDQUFDO1FBQ0wsQ0FBQztJQUNMLENBQUM7SUFDTCxnQkFBQztBQUFELENBcEVBLEFBb0VDLElBQUE7QUFwRVksOEJBQVM7QUFzRXRCO0lBTUksMEJBQVksUUFBZ0IsRUFBRSxNQUFjLEVBQUUsU0FBa0I7UUFDNUQsSUFBSSxDQUFDLFNBQVMsR0FBRyxRQUFRLENBQUM7UUFDMUIsSUFBSSxDQUFDLE9BQU8sR0FBRyxNQUFNLENBQUM7UUFDdEIsSUFBSSxDQUFDLFVBQVUsR0FBRyxTQUFTLENBQUM7UUFDNUIsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLHNCQUFTLEVBQWEsQ0FBQztRQUV6QyxJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3ZELENBQUM7SUFFRCx5Q0FBYyxHQUFkLFVBQWUsVUFBc0IsRUFBRSxRQUFvQjtRQUN2RCxJQUFJLFFBQVEsR0FBYyxFQUFFLENBQUM7UUFFN0IsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxVQUFVLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDekMsSUFBSSxPQUFPLEdBQUcsVUFBVSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN6QyxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsRUFBRSxJQUFJLE9BQU8sQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDbEMsUUFBUSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUMzQixDQUFDO1FBQ0wsQ0FBQztRQUVELElBQUksQ0FBQyxhQUFhLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQzNDLENBQUM7SUFFTyx3Q0FBYSxHQUFyQixVQUFzQixRQUFtQixFQUFFLFFBQW9CO1FBQS9ELGlCQVVDO1FBVEcsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLE1BQU0sSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3ZCLFFBQVEsRUFBRSxDQUFDO1lBQ1gsTUFBTSxDQUFDO1FBQ1gsQ0FBQztRQUVELElBQUksT0FBTyxHQUFHLFFBQVEsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUMvQixJQUFJLENBQUMsV0FBVyxDQUFDLE9BQU8sRUFBRTtZQUN0QixLQUFJLENBQUMsYUFBYSxDQUFDLFFBQVEsRUFBRSxRQUFRLENBQUMsQ0FBQztRQUMzQyxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7SUFFRCxzQ0FBVyxHQUFYLFVBQVksT0FBZSxFQUFFLElBQW9CLEVBQUUsUUFBd0M7UUFBM0YsaUJBK0JDO1FBOUJHLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRXpCLElBQUksSUFBSSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ3BDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNmLE1BQU0sQ0FBQztRQUNYLENBQUM7UUFFRCxJQUFJLEdBQUcsR0FBTSxJQUFJLENBQUMsU0FBUyxVQUFLLElBQUksQ0FBQyxPQUFPLDBCQUFxQixPQUFPLFVBQU8sQ0FBQztRQUVoRixFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVSxJQUFJLElBQUksQ0FBQyxVQUFVLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztZQUMzQyxHQUFHLEdBQU0sR0FBRyxhQUFRLElBQUksQ0FBQyxVQUFZLENBQUM7UUFDMUMsQ0FBQztRQUVELElBQUksR0FBRyxHQUFHLElBQUksY0FBYyxFQUFFLENBQUM7UUFDL0IsR0FBRyxDQUFDLFNBQVMsR0FBRztZQUNaLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxNQUFNLElBQUksR0FBRyxDQUFDLENBQUMsQ0FBQztnQkFDcEIsSUFBSSxHQUFHLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLENBQUM7Z0JBQ3ZDLElBQUksU0FBUyxHQUFHLElBQUksU0FBUyxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQztnQkFHekMsS0FBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsT0FBTyxFQUFFLFNBQVMsQ0FBQyxDQUFDO2dCQUVwQyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDeEIsQ0FBQztZQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNKLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNuQixDQUFDO1FBQ0wsQ0FBQyxDQUFDO1FBRUYsR0FBRyxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDckIsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDO0lBQ2YsQ0FBQztJQUVELHNDQUFXLEdBQVgsVUFBWSxPQUFnQixFQUFFLFFBQXdDO1FBQ2xFLElBQU0sT0FBTyxHQUFXLE9BQU8sQ0FBQyxFQUFFLENBQUM7UUFDbkMsSUFBTSxJQUFJLEdBQUcsd0JBQVUsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFdEMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxPQUFPLEVBQUUsSUFBSSxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQzlDLENBQUM7SUFFRCxtQ0FBUSxHQUFSLFVBQVMsT0FBZTtRQUNwQixNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDcEMsQ0FBQztJQUVELHVDQUFZLEdBQVosVUFBYSxPQUFlO1FBQ3hCLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3pCLElBQUksSUFBSSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ3BDLE1BQU0sQ0FBQyxJQUFJLENBQUM7UUFDaEIsQ0FBQztRQUVELE1BQU0sQ0FBQyxTQUFTLENBQUM7SUFDckIsQ0FBQztJQUVELGdDQUFLLEdBQUw7UUFDSSxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxDQUFDO0lBQ3hCLENBQUM7SUFDTCx1QkFBQztBQUFELENBaEdBLEFBZ0dDLElBQUE7QUFoR1ksNENBQWdCOzs7OztBQy9JN0I7SUFpQkkscUJBQVksUUFBZ0IsRUFBRSxNQUFjLEVBQUUsU0FBaUIsRUFBRSxLQUF1QjtRQUh2RSxVQUFLLEdBQUcsT0FBTyxDQUFDO1FBQ2hCLFNBQUksR0FBRyxNQUFNLENBQUM7UUFJM0IsSUFBSSxDQUFDLFNBQVMsR0FBRyxRQUFRLENBQUM7UUFDMUIsSUFBSSxDQUFDLE9BQU8sR0FBRyxNQUFNLENBQUM7UUFDdEIsSUFBSSxDQUFDLFVBQVUsR0FBRyxTQUFTLENBQUM7UUFDNUIsSUFBSSxDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUM7UUFFcEIsSUFBSSxDQUFDLFdBQVcsR0FBRyxTQUFTLElBQUksSUFBSSxJQUFJLFNBQVMsSUFBSSxFQUFFLENBQUM7UUFDeEQsSUFBSSxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUM7UUFFM0IsSUFBSSxDQUFDLGNBQWMsR0FBRyxLQUFLLENBQUM7UUFDNUIsSUFBSSxDQUFDLFFBQVEsR0FBRyxLQUFLLENBQUM7UUFFdEIsSUFBSSxDQUFDLFlBQVksR0FBRyxHQUFHLENBQUM7UUFDeEIsSUFBSSxDQUFDLGFBQWEsR0FBRyxHQUFHLENBQUM7UUFFekIsSUFBSSxDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUM7UUFFcEIsSUFBSSxDQUFDLHdCQUF3QixHQUFHLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDekUsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN6QyxJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzNDLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFN0MsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUM7WUFDbkIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxZQUFZLEVBQUUsSUFBSSxDQUFDLHdCQUF3QixDQUFDLENBQUM7WUFDMUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQ3ZELElBQUksQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUN2RCxJQUFJLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDN0QsQ0FBQztJQUNMLENBQUM7SUFFTyx3Q0FBa0IsR0FBMUIsVUFBMkIsS0FBYSxFQUFFLGVBQXVCLEVBQUUsWUFBcUI7UUFDcEYsSUFBTSxPQUFPLEdBQUcsQ0FBQyxDQUFDO1FBRWxCLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFDUixJQUFJLEdBQUcsR0FBRyxPQUFLLE9BQU8sWUFBTyxLQUFLLFlBQU8sZUFBaUIsQ0FBQztZQUUzRCxFQUFFLENBQUMsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDO2dCQUNmLEdBQUcsSUFBSSxTQUFPLFlBQWMsQ0FBQztZQUNqQyxDQUFDO1lBRUQsTUFBTSxDQUFDLEdBQUcsQ0FBQztRQUNmLENBQUM7UUFFRCxNQUFNLENBQUMsT0FBSyxPQUFPLFlBQU8sZUFBaUIsQ0FBQztJQUNoRCxDQUFDO0lBRU8sOEJBQVEsR0FBaEI7UUFDSSxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVyxJQUFJLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUM7WUFDM0MsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzlCLElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFDO1FBQy9CLENBQUM7SUFDTCxDQUFDO0lBRU8sZ0NBQVUsR0FBbEI7UUFDSSxJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQztRQUNyQixJQUFJLENBQUMsU0FBUyxHQUFHLFNBQVMsQ0FBQztRQUMzQixJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUM7SUFDM0MsQ0FBQztJQUVPLCtCQUFTLEdBQWpCO1FBQ0ksRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVcsSUFBSSxJQUFJLENBQUMsUUFBUSxJQUFJLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDO1lBQzFELElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsWUFBWSxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztZQUNqRSxJQUFJLENBQUMsUUFBUSxHQUFHLEtBQUssQ0FBQztZQUN0QixJQUFJLENBQUMsYUFBYSxHQUFHLFNBQVMsQ0FBQztRQUNuQyxDQUFDO0lBQ0wsQ0FBQztJQUVPLDhDQUF3QixHQUFoQztRQUNJLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUM7UUFFNUMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVcsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLElBQUksSUFBSSxDQUFDLFNBQVMsSUFBSSxJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO1lBQzdGLElBQUksQ0FBQyxTQUFTLEdBQUcsU0FBUyxDQUFDO1lBQzNCLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUM1QyxDQUFDO0lBQ0wsQ0FBQztJQUVPLCtCQUFTLEdBQWpCLFVBQWtCLEtBQWEsRUFBRSxlQUF1QixFQUFFLFlBQXFCO1FBQS9FLGlCQTBCQztRQXpCRyxJQUFJLEdBQUcsR0FBTSxJQUFJLENBQUMsU0FBUyxVQUFLLElBQUksQ0FBQyxPQUFPLHNCQUFpQixJQUFJLENBQUMsVUFBVSxjQUFTLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxLQUFLLEVBQUUsZUFBZSxFQUFFLFlBQVksQ0FBRyxDQUFDO1FBRXJKLElBQUksR0FBRyxHQUFHLElBQUksY0FBYyxFQUFFLENBQUM7UUFDL0IsR0FBRyxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzNCLEdBQUcsQ0FBQyxZQUFZLEdBQUcsTUFBTSxDQUFDO1FBRTFCLEdBQUcsQ0FBQyxNQUFNLEdBQUc7WUFDVCxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQ3JCLElBQUksSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxDQUFDO2dCQUN4QyxLQUFJLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUM7Z0JBR2hDLEVBQUUsQ0FBQyxDQUFDLEtBQUksQ0FBQyxTQUFTLEdBQUcsQ0FBQyxJQUFJLElBQUksQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUNyRCxLQUFJLENBQUMsV0FBVyxHQUFHLEtBQUssQ0FBQztvQkFDekIsS0FBSSxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUM7b0JBRTNCLEtBQUksQ0FBQyxNQUFNLENBQUMsbUJBQW1CLENBQUMsWUFBWSxFQUFFLEtBQUksQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO29CQUM3RSxLQUFJLENBQUMsTUFBTSxDQUFDLG1CQUFtQixDQUFDLFNBQVMsRUFBRSxLQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7b0JBQzFELEtBQUksQ0FBQyxNQUFNLENBQUMsbUJBQW1CLENBQUMsUUFBUSxFQUFFLEtBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztvQkFDMUQsS0FBSSxDQUFDLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxTQUFTLEVBQUUsS0FBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO2dCQUNoRSxDQUFDO1lBQ0wsQ0FBQztRQUNMLENBQUMsQ0FBQztRQUVGLEdBQUcsQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUNmLENBQUM7SUFDTCxrQkFBQztBQUFELENBekhBLEFBeUhDLElBQUE7QUF6SFksa0NBQVciLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbigpe2Z1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfXJldHVybiBlfSkoKSIsImV4cG9ydCBjbGFzcyBBZEJyZWFrIHtcbiAgICByZWFkb25seSBzdGFydFRpbWU6IG51bWJlcjtcbiAgICByZWFkb25seSBlbmRUaW1lOiBudW1iZXI7XG4gICAgcmVhZG9ubHkgZHVyYXRpb246IG51bWJlcjtcbiAgICByZWFkb25seSBudW1BZHM6IG51bWJlcjtcbiAgICBwcml2YXRlIF9zZWdtZW50czogU2VnbWVudFtdO1xuXG4gICAgY29uc3RydWN0b3Ioc2VnbWVudHM6IFNlZ21lbnRbXSkge1xuICAgICAgICBpZiAoc2VnbWVudHMgJiYgc2VnbWVudHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgdGhpcy5fc2VnbWVudHMgPSBzZWdtZW50cztcbiAgICAgICAgICAgIHRoaXMubnVtQWRzID0gc2VnbWVudHMubGVuZ3RoO1xuICAgICAgICAgICAgdGhpcy5zdGFydFRpbWUgPSBzZWdtZW50c1swXS5zdGFydFRpbWU7XG4gICAgICAgICAgICB0aGlzLmVuZFRpbWUgPSBzZWdtZW50c1tzZWdtZW50cy5sZW5ndGggLSAxXS5lbmRUaW1lO1xuICAgICAgICAgICAgdGhpcy5kdXJhdGlvbiA9IHRoaXMuZW5kVGltZSAtIHRoaXMuc3RhcnRUaW1lO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0QWRQb3NpdGlvbkF0KHRpbWU6IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fc2VnbWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGlmICh0aGlzLl9zZWdtZW50c1tpXS5zdGFydFRpbWUgPD0gdGltZSAmJiB0aW1lIDw9IHRoaXMuX3NlZ21lbnRzW2ldLmVuZFRpbWUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gaSArIDE7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gMDtcbiAgICB9XG5cbiAgICBnZXRTZWdtZW50QXQoaW5kZXg6IG51bWJlcik6IFNlZ21lbnQge1xuICAgICAgICBpZih0aGlzLl9zZWdtZW50cyAmJiBpbmRleCA+IC0xICYmIGluZGV4IDwgdGhpcy5fc2VnbWVudHMubGVuZ3RoKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fc2VnbWVudHNbaW5kZXhdO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICBjb250YWlucyh0aW1lOiBudW1iZXIpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc3RhcnRUaW1lIDw9IHRpbWUgJiYgdGltZSA8PSB0aGlzLmVuZFRpbWU7XG4gICAgfVxufSIsImltcG9ydCB7IE9ic2VydmFibGUgfSBmcm9tICcuL3V0aWxzL29ic2VydmFibGUnO1xuaW1wb3J0IHsgQXNzZXRJbmZvLCBBc3NldEluZm9TZXJ2aWNlIH0gZnJvbSAnLi93ZWItc2VydmljZXMvYXNzZXQtaW5mby1zZXJ2aWNlJztcbmltcG9ydCB7IFBpbmdTZXJ2aWNlIH0gZnJvbSAnLi93ZWItc2VydmljZXMvcGluZy1zZXJ2aWNlJztcbmltcG9ydCB7IElEM0hhbmRsZXIsIElEM1RhZ0V2ZW50LCBUeHh4SUQzRnJhbWVFdmVudCwgUHJpdklEM0ZyYW1lRXZlbnQsIFRleHRJRDNGcmFtZUV2ZW50LCBTbGljZUV2ZW50IH0gZnJvbSAnLi9pZDMvaWQzLWhhbmRsZXInO1xuaW1wb3J0IHsgSUQzRGF0YSB9IGZyb20gJy4vaWQzL2lkMy1kYXRhJztcbmltcG9ydCB7IFNlZ21lbnRNYXAgfSBmcm9tICcuL3V0aWxzL3NlZ21lbnQtbWFwJztcbmltcG9ydCAqIGFzIHRodW1iIGZyb20gJy4vdXRpbHMvdGh1bWJuYWlsLWhlbHBlcic7XG5pbXBvcnQgeyBBZEJyZWFrIH0gZnJvbSAnLi9hZC9hZC1icmVhayc7XG5pbXBvcnQgeyBFdmVudHMgfSBmcm9tICcuL2V2ZW50cyc7XG5pbXBvcnQgeyBQbGF5ZXIsIFJlc29sdXRpb24sIE1pbWVUeXBlIH0gZnJvbSAnLi9wbGF5ZXInO1xuaW1wb3J0IHsgaXNMb2NhbFN0b3JhZ2VBdmFpbGFibGUgfSBmcm9tICcuL3V0aWxzL3V0aWxzJztcbmltcG9ydCB7IExpY2Vuc2VNYW5hZ2VyIH0gZnJvbSAnLi9saWNlbnNlLW1hbmFnZXInO1xuaW1wb3J0IHsgYmFzZTY0VG9CdWZmZXIsIGdldFByb3RvY29sLCBpc0lFMTFPckVkZ2UgfSBmcm9tICcuL3V0aWxzL3V0aWxzJztcblxuZXhwb3J0IGNsYXNzIEFkYXB0aXZlUGxheWVyIGV4dGVuZHMgT2JzZXJ2YWJsZSBpbXBsZW1lbnRzIFBsYXllciB7XG4gICAgcHJpdmF0ZSBfdmlkZW86IEhUTUxWaWRlb0VsZW1lbnQ7XG4gICAgcHJpdmF0ZSBfYWRhcHRpdmVTb3VyY2U6IE1vZHVsZS5BZGFwdGl2ZVNvdXJjZTtcbiAgICBwcml2YXRlIF9tZWRpYVNvdXJjZTogTWVkaWFTb3VyY2U7XG4gICAgcHJpdmF0ZSBfdXJsOiBzdHJpbmc7XG4gICAgcHJpdmF0ZSBfb2JqZWN0VXJsOiBzdHJpbmc7XG4gICAgcHJpdmF0ZSBfYXNzZXRJbmZvU2VydmljZTogQXNzZXRJbmZvU2VydmljZTtcbiAgICBwcml2YXRlIF9waW5nU2VydmljZTogUGluZ1NlcnZpY2U7XG4gICAgcHJpdmF0ZSBfaWQzSGFuZGxlcjogSUQzSGFuZGxlcjtcbiAgICBwcml2YXRlIF9zZWdtZW50TWFwOiBTZWdtZW50TWFwO1xuICAgIHByaXZhdGUgX2NvbmZpZzogUGxheWVyT3B0aW9ucztcbiAgICBwcml2YXRlIF9maXJlZFJlYWR5RXZlbnQ6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSBfaXNTYWZhcmk6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSBfaXNGaXJlZm94OiBib29sZWFuO1xuICAgIHByaXZhdGUgX2lzQ2hyb21lOiBib29sZWFuO1xuICAgIHByaXZhdGUgX2lzSUU6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSBfaXNQYXVzZWQ6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSBfdGFyZ2V0VGltZTogbnVtYmVyO1xuICAgIHByaXZhdGUgX2ZvcmNlZEFkQnJlYWs6IEFkQnJlYWs7XG4gICAgcHJpdmF0ZSBfdmlkZW9SZWN0OiBDbGllbnRSZWN0O1xuICAgIHByaXZhdGUgX2VuZGVkOiBib29sZWFuO1xuICAgIHByaXZhdGUgX3VzaW5nQ3VzdG9tVUk6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSBfaW50ZXJ2YWxJZDogbnVtYmVyO1xuICAgIHByaXZhdGUgX2xpY2Vuc2VNYW5hZ2VyOiBMaWNlbnNlTWFuYWdlcjtcbiAgICBwcml2YXRlIF9wcm90b2NvbDogc3RyaW5nO1xuXG4gICAgcHJpdmF0ZSByZWFkb25seSBfZGVmYXVsdHM6IFBsYXllck9wdGlvbnMgPSB7XG4gICAgICAgIGRpc2FibGVTZWVrRHVyaW5nQWRCcmVhazogdHJ1ZSxcbiAgICAgICAgc2hvd1Bvc3RlcjogZmFsc2UsXG4gICAgICAgIGRlYnVnOiBmYWxzZSxcbiAgICAgICAgbGltaXRSZXNvbHV0aW9uVG9WaWV3U2l6ZTogZmFsc2UsXG4gICAgfTtcblxuICAgIGNvbnN0cnVjdG9yKHZpZGVvOiBIVE1MVmlkZW9FbGVtZW50LCBvcHRpb25zPzogUGxheWVyT3B0aW9ucykge1xuICAgICAgICBzdXBlcigpO1xuXG4gICAgICAgIC8vaW5pdCBjb25maWdcbiAgICAgICAgdmFyIGRhdGEgPSB7fTtcblxuICAgICAgICAvL3RyeSBwYXJzaW5nIGRhdGEgYXR0cmlidXRlIGNvbmZpZ1xuICAgICAgICB0cnkgeyBkYXRhID0gSlNPTi5wYXJzZSh2aWRlby5nZXRBdHRyaWJ1dGUoJ2RhdGEtY29uZmlnJykpOyB9XG4gICAgICAgIGNhdGNoIChlKSB7IH1cblxuICAgICAgICAvL21lcmdlIGRlZmF1bHRzIHdpdGggdXNlciBvcHRpb25zXG4gICAgICAgIHRoaXMuX2NvbmZpZyA9IE9iamVjdC5hc3NpZ24oe30sIHRoaXMuX2RlZmF1bHRzLCBvcHRpb25zLCBkYXRhKTtcblxuICAgICAgICB0aGlzLl92aWRlbyA9IHZpZGVvO1xuICAgICAgICB0aGlzLl9pZDNIYW5kbGVyID0gbmV3IElEM0hhbmRsZXIodmlkZW8pO1xuICAgICAgICB0aGlzLl9pZDNIYW5kbGVyLm9uKElEM0hhbmRsZXIuRXZlbnQuSUQzVGFnLCB0aGlzLl9vbklEM1RhZy5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5faWQzSGFuZGxlci5vbihJRDNIYW5kbGVyLkV2ZW50LlR4eHhJRDNGcmFtZSwgdGhpcy5fb25UeHh4SUQzRnJhbWUuYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuX2lkM0hhbmRsZXIub24oSUQzSGFuZGxlci5FdmVudC5Qcml2SUQzRnJhbWUsIHRoaXMuX29uUHJpdklEM0ZyYW1lLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLl9pZDNIYW5kbGVyLm9uKElEM0hhbmRsZXIuRXZlbnQuVGV4dElEM0ZyYW1lLCB0aGlzLl9vblRleHRJRDNGcmFtZS5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5faWQzSGFuZGxlci5vbihJRDNIYW5kbGVyLkV2ZW50LlNsaWNlRW50ZXJlZCwgdGhpcy5fb25TbGljZUVudGVyZWQuYmluZCh0aGlzKSk7XG5cbiAgICAgICAgdGhpcy5fb25WaWRlb1RpbWVVcGRhdGUgPSB0aGlzLl9vblZpZGVvVGltZVVwZGF0ZS5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLl9vblZpZGVvU2Vla2luZyA9IHRoaXMuX29uVmlkZW9TZWVraW5nLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuX29uVmlkZW9TZWVrZWQgPSB0aGlzLl9vblZpZGVvU2Vla2VkLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuX29uTWVkaWFTb3VyY2VPcGVuID0gdGhpcy5fb25NZWRpYVNvdXJjZU9wZW4uYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5fb25WaWRlb1BsYXliYWNrRW5kID0gdGhpcy5fb25WaWRlb1BsYXliYWNrRW5kLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuX29uVGltZXJUaWNrID0gdGhpcy5fb25UaW1lclRpY2suYmluZCh0aGlzKTtcblxuICAgICAgICB0aGlzLl9pc1NhZmFyaSA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9pc0lFID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2lzRmlyZWZveCA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9pc0Nocm9tZSA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9maXJlZFJlYWR5RXZlbnQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fZW5kZWQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fdXNpbmdDdXN0b21VSSA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9pbnRlcnZhbElkID0gMDtcblxuICAgICAgICB0aGlzLl9vdmVycmlkZUN1cnJlbnRUaW1lKCk7XG4gICAgICAgIHRoaXMuX292ZXJyaWRlRW5kZWQoKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vdmVycmlkZUN1cnJlbnRUaW1lKCk6IHZvaWQge1xuICAgICAgICAvL292ZXJyaWRlICdjdXJyZW50VGltZScgcHJvcGVydHkgc28gd2UgY2FuIHByZXZlbnQgdXNlcnMgZnJvbSBzZXR0aW5nIHZpZGVvLmN1cnJlbnRUaW1lLCBhbGxvd2luZyB0aGVtXG4gICAgICAgIC8vIHRvIHNraXAgYWRzLlxuICAgICAgICB2YXIgY3VycmVudFRpbWVQcm9wZXJ0eSA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IoSFRNTE1lZGlhRWxlbWVudC5wcm90b3R5cGUsICdjdXJyZW50VGltZScpO1xuICAgICAgICBpZiAoY3VycmVudFRpbWVQcm9wZXJ0eSkge1xuXG4gICAgICAgICAgICB2YXIgZ2V0Q3VycmVudFRpbWUgPSBjdXJyZW50VGltZVByb3BlcnR5LmdldDtcbiAgICAgICAgICAgIHZhciBzZXRDdXJyZW50VGltZSA9IGN1cnJlbnRUaW1lUHJvcGVydHkuc2V0O1xuXG4gICAgICAgICAgICBsZXQgc2VsZiA9IHRoaXM7XG5cbiAgICAgICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0aGlzLl92aWRlbywgJ2N1cnJlbnRUaW1lJywge1xuICAgICAgICAgICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZ2V0Q3VycmVudFRpbWUuYXBwbHkodGhpcyk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBzZXQ6IGZ1bmN0aW9uICh2YWw6IG51bWJlcikge1xuICAgICAgICAgICAgICAgICAgICBpZiAoc2VsZi5jYW5TZWVrKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYuX2VuZGVkID0gZmFsc2U7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IHBhcnNlRmxvYXQoPGFueT52YWwpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgYWN0dWFsVGltZSA9IHNlbGYuZ2V0U2Vla1RpbWUodmFsKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNldEN1cnJlbnRUaW1lLmFwcGx5KHRoaXMsIFthY3R1YWxUaW1lXSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vY2FsbCBzZWVrIHJpZ2h0IGF3YXkgaW5zdGVhZCBvZiB3YWl0aW5nIGZvciAnc2Vla2luZycgZXZlbnRcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHNvIHBsYXllciBkb2Vzbid0IGhhdmUgdGltZSB0byBkb3duc2hpZnQgdGhpbmtpbmcgaXQgaGFzXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBubyBkYXRhIGF0IHRoZSBjdXJyZW50VGltZSBwb3NpdGlvbiAoVVAtNjAxMCkuXG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxmLl9hZGFwdGl2ZVNvdXJjZS5zZWVrKGFjdHVhbFRpbWUpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBlbnVtZXJhYmxlOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBjb25maWd1cmFibGU6IGZhbHNlLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIF9vdmVycmlkZUVuZGVkKCk6IHZvaWQge1xuICAgICAgICAvL292ZXJyaWRlIGVuZGVkIHByb3BlcnR5IHNvIHdlIGNhbiBtYWtlIGl0IG5vdCByZWFkLW9ubHkuIGFsbG93aW5nIHVzIHRvIGZpcmUgdGhlICdlbmRlZCdcbiAgICAgICAgLy8gZXZlbnQgYW5kIGhhdmUgdGhlIHVpIHJlc3BvbmQgY29ycmVjdGx5XG4gICAgICAgIGxldCBzZWxmID0gdGhpcztcblxuICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkodGhpcy5fdmlkZW8sICdlbmRlZCcsIHtcbiAgICAgICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBzZWxmLl9lbmRlZDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBlbnVtZXJhYmxlOiBmYWxzZSxcbiAgICAgICAgICAgIGNvbmZpZ3VyYWJsZTogZmFsc2UsXG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHN0YXRpYyBnZXQgRXZlbnQoKSB7XG4gICAgICAgIHJldHVybiBFdmVudHM7XG4gICAgfVxuXG4gICAgZGVzdHJveSgpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5fc3RvcE1haW5Mb29wKCk7XG5cbiAgICAgICAgaWYgKHR5cGVvZiB0aGlzLl9hZGFwdGl2ZVNvdXJjZSAhPSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2UuZGVsZXRlKCk7XG4gICAgICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZSA9IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLl9vYmplY3RVcmwpIHtcbiAgICAgICAgICAgIHdpbmRvdy5VUkwucmV2b2tlT2JqZWN0VVJMKHRoaXMuX29iamVjdFVybCk7XG4gICAgICAgICAgICB0aGlzLl9vYmplY3RVcmwgPSBudWxsO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgbG9hZChpbmZvOiBzdHJpbmcgfCBMb2FkQ29uZmlnKTogdm9pZCB7XG4gICAgICAgIGxldCB1cmw6IHN0cmluZztcbiAgICAgICAgaWYgKHR5cGVvZiBpbmZvID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICB1cmwgPSBpbmZvIGFzIHN0cmluZztcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHVybCA9IChpbmZvIGFzIExvYWRDb25maWcpLnVybDtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX3Byb3RvY29sID0gZ2V0UHJvdG9jb2wodXJsKTtcbiAgICAgICAgLy9JRTExIGFuZCBFZGdlIGRvbid0IHJlZGlyZWN0ICdodHRwOicgdG8gJ2h0dHBzOicgYWZ0ZXIgSFNUUyBoZWFkZXJzIGFyZSByZXR1cm5lZFxuICAgICAgICAvLyBmcm9tIHRoZSBmaXJzdCAnaHR0cHM6JyByZXF1ZXN0LiAgSW5zdGVhZCwgYSA1MDAgZXJyb3IgaXMgcmV0dXJuZWQuICBTbyBqdXN0IGZvcmNlXG4gICAgICAgIC8vICdodHRwczonIGZyb20gdGhlIGdldCBnbyBhbmQgd2UgY2FuIGF2b2lkIHRob3NlIGlzc3Vlcy5cbiAgICAgICAgaWYgKGlzSUUxMU9yRWRnZSgpICYmIHRoaXMuX3Byb3RvY29sID09PSAnaHR0cDonICYmIHRoaXMuX2lzVXBseW5rVXJsKHVybCkpIHtcbiAgICAgICAgICAgIHRoaXMuX3Byb3RvY29sID0gJ2h0dHBzOic7XG4gICAgICAgICAgICB1cmwgPSAnaHR0cHM6JyArIHVybC5zdWJzdHIoNSk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9maXJlZFJlYWR5RXZlbnQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fdXJsID0gdXJsO1xuICAgICAgICB0aGlzLl90YXJnZXRUaW1lID0gdW5kZWZpbmVkO1xuICAgICAgICB0aGlzLl9mb3JjZWRBZEJyZWFrID0gdW5kZWZpbmVkO1xuICAgICAgICB0aGlzLl9lbmRlZCA9IGZhbHNlO1xuXG4gICAgICAgIHRoaXMuX21lZGlhU291cmNlID0gbmV3IE1lZGlhU291cmNlKCk7XG4gICAgICAgIGlmICh0eXBlb2YgdGhpcy5fYWRhcHRpdmVTb3VyY2UgIT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlLmRlbGV0ZSgpO1xuICAgICAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2UgPSB1bmRlZmluZWQ7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl92aWRlby5yZW1vdmVFdmVudExpc3RlbmVyKCd0aW1ldXBkYXRlJywgdGhpcy5fb25WaWRlb1RpbWVVcGRhdGUpO1xuICAgICAgICB0aGlzLl92aWRlby5yZW1vdmVFdmVudExpc3RlbmVyKCdzZWVraW5nJywgdGhpcy5fb25WaWRlb1NlZWtpbmcpO1xuICAgICAgICB0aGlzLl92aWRlby5yZW1vdmVFdmVudExpc3RlbmVyKCdzZWVrZWQnLCB0aGlzLl9vblZpZGVvU2Vla2VkKTtcbiAgICAgICAgdGhpcy5fdmlkZW8ucmVtb3ZlRXZlbnRMaXN0ZW5lcignZW5kZWQnLCB0aGlzLl9vblZpZGVvUGxheWJhY2tFbmQpO1xuXG4gICAgICAgIHRoaXMuX3ZpZGVvLmFkZEV2ZW50TGlzdGVuZXIoJ3RpbWV1cGRhdGUnLCB0aGlzLl9vblZpZGVvVGltZVVwZGF0ZSk7XG4gICAgICAgIHRoaXMuX3ZpZGVvLmFkZEV2ZW50TGlzdGVuZXIoJ3NlZWtpbmcnLCB0aGlzLl9vblZpZGVvU2Vla2luZyk7XG4gICAgICAgIHRoaXMuX3ZpZGVvLmFkZEV2ZW50TGlzdGVuZXIoJ3NlZWtlZCcsIHRoaXMuX29uVmlkZW9TZWVrZWQpO1xuICAgICAgICB0aGlzLl92aWRlby5hZGRFdmVudExpc3RlbmVyKCdlbmRlZCcsIHRoaXMuX29uVmlkZW9QbGF5YmFja0VuZCk7XG4gICAgICAgIC8vIHZpZGVvLm9ubG9hZGVkbWV0YWRhdGEgaXMgdGhlIGZpcnN0IHRpbWUgdGhlIHZpZGVvIHdpZHRoL2hlaWdodCBpcyBhdmFpbGFibGVcbiAgICAgICAgdGhpcy5fdmlkZW8ub25sb2FkZWRtZXRhZGF0YSA9IHRoaXMudXBkYXRlVmlkZW9SZWN0LmJpbmQodGhpcyk7XG5cbiAgICAgICAgdGhpcy5fbWVkaWFTb3VyY2UuYWRkRXZlbnRMaXN0ZW5lcignc291cmNlb3BlbicsIHRoaXMuX29uTWVkaWFTb3VyY2VPcGVuKTtcblxuICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZSA9IG5ldyBNb2R1bGUuQWRhcHRpdmVTb3VyY2UoKTtcbiAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2Uub25CZWFtTG9hZGVkKHRoaXMuX29uQmVhbUxvYWRlZC5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2Uub25UcmFja0xvYWRlZCh0aGlzLl9vblRyYWNrTG9hZGVkLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5vbkxvYWRlZCh0aGlzLl9vblNvdXJjZUxvYWRlZC5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2Uub25Mb2FkRXJyb3IodGhpcy5fb25Mb2FkRXJyb3IuYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlLm9uRHJtRXJyb3IodGhpcy5fb25Ecm1FcnJvci5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2Uub25TZWdtZW50TWFwQ2hhbmdlZCh0aGlzLl9vblNlZ21lbnRNYXBDaGFuZ2VkLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5zdGFydE1haW5Mb29wKHRoaXMuX3N0YXJ0TWFpbkxvb3AuYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlLnN0b3BNYWluTG9vcCh0aGlzLl9zdG9wTWFpbkxvb3AuYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlLnN0YXJ0TGljZW5zZVJlcXVlc3QodGhpcy5fc3RhcnRMaWNlbnNlUmVxdWVzdC5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2Uub25BdWRpb1RyYWNrU3dpdGNoZWQodGhpcy5fb25BdWRpb1RyYWNrU3dpdGNoZWQuYmluZCh0aGlzKSk7XG5cbiAgICAgICAgdGhpcy5fbGljZW5zZU1hbmFnZXIgPSBuZXcgTGljZW5zZU1hbmFnZXIodGhpcy5fdmlkZW8sdGhpcy5fYWRhcHRpdmVTb3VyY2UpO1xuXG4gICAgICAgIGlmIChpc0xvY2FsU3RvcmFnZUF2YWlsYWJsZSgpKSB7XG4gICAgICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5zZXRMb2FkQW5kU2F2ZUJhbmR3aWR0aCh0aGlzLl9sb2FkQmFuZHdpZHRoSGlzdG9yeS5iaW5kKHRoaXMpLCB0aGlzLl9zYXZlQmFuZHdpZHRoSGlzdG9yeS5iaW5kKHRoaXMpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLl9vYmplY3RVcmwpIHtcbiAgICAgICAgICAgIHdpbmRvdy5VUkwucmV2b2tlT2JqZWN0VVJMKHRoaXMuX29iamVjdFVybCk7XG4gICAgICAgICAgICB0aGlzLl9vYmplY3RVcmwgPSBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fb2JqZWN0VXJsID0gd2luZG93LlVSTC5jcmVhdGVPYmplY3RVUkwodGhpcy5fbWVkaWFTb3VyY2UpO1xuICAgICAgICB0aGlzLl92aWRlby5zcmMgPSB0aGlzLl9vYmplY3RVcmw7XG4gICAgICAgIHRoaXMuX3ZpZGVvLmxvYWQoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEZXRlcm1pbmVzIGlmIHRoZSBwbGF5ZXIgY2FuIHNlZWsgZ2l2ZW4gaXQncyBjdXJyZW50IHBvc2l0aW9uIGFuZFxuICAgICAqIHdoZXRoZXIgb3Igbm90IGl0J3MgaW4gYW4gYWQgYnJlYWsuXG4gICAgICogQHJldHVybiB7Ym9vbGVhbn0gVHJ1ZSBpZiB0aGUgcGxheWVyIGNhbiBzZWVrLCBvdGhlcndpc2UgZmFsc2UuXG4gICAgICovXG4gICAgY2FuU2VlaygpOiBib29sZWFuIHtcbiAgICAgICAgaWYgKHRoaXMuX2FkYXB0aXZlU291cmNlID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLnBsYXlsaXN0VHlwZSA9PT0gJ0xJVkUnIHx8IHRoaXMucGxheWxpc3RUeXBlID09PSAnRVZFTlQnKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vY2FuJ3QgcHJldmVudCBhbGwgc2Vla3MgKHZpYSB1aSBvciBjdXJyZW50VGltZSBwcm9wZXJ0eSlcbiAgICAgICAgLy8gd2l0aG91dCB1c2luZyBhIGN1c3RvbSB1aSAoVVAtMzI2OSkuXG4gICAgICAgIGlmICghdGhpcy5fdXNpbmdDdXN0b21VSSkge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXRoaXMuX2NvbmZpZy5kaXNhYmxlU2Vla0R1cmluZ0FkQnJlYWspIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuX3NlZ21lbnRNYXAgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuICF0aGlzLl9zZWdtZW50TWFwLmluQWRCcmVhayh0aGlzLl92aWRlby5jdXJyZW50VGltZSk7XG4gICAgfVxuXG4gICAgZ2V0U2Vla1RpbWUodGFyZ2V0VGltZTogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKHRoaXMucGxheWxpc3RUeXBlID09PSAnTElWRScgfHwgdGhpcy5wbGF5bGlzdFR5cGUgPT09ICdFVkVOVCcpIHtcbiAgICAgICAgICAgIHJldHVybiB0YXJnZXRUaW1lO1xuICAgICAgICB9XG5cbiAgICAgICAgLy9hbGxvdyB1c2VycyB0byBzZWVrIGF0IGFueSB0aW1lXG4gICAgICAgIGlmICghdGhpcy5fY29uZmlnLmRpc2FibGVTZWVrRHVyaW5nQWRCcmVhaykge1xuICAgICAgICAgICAgcmV0dXJuIHRhcmdldFRpbWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXRoaXMuX3VzaW5nQ3VzdG9tVUkpIHtcbiAgICAgICAgICAgIHJldHVybiB0YXJnZXRUaW1lO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IGN1cnJlbnRUaW1lID0gdGhpcy5fdmlkZW8uY3VycmVudFRpbWU7XG5cbiAgICAgICAgLy9hcmUgd2Ugc2Vla2luZyB0byB0aGUgbWlkZGxlIG9mIGFuIGFkP1xuICAgICAgICAvL2lmIHNvLCBzZWVrIHRvIGJlZ2lubmluZyBvZiB0aGUgYWQgYW5kIHBsYXkgb24uXG4gICAgICAgIGxldCBhZEJyZWFrID0gdGhpcy5fc2VnbWVudE1hcC5nZXRBZEJyZWFrKHRhcmdldFRpbWUpO1xuICAgICAgICBpZiAoYWRCcmVhaykge1xuICAgICAgICAgICAgcmV0dXJuIGFkQnJlYWsuc3RhcnRUaW1lO1xuICAgICAgICB9XG5cbiAgICAgICAgLy9hcmUgd2Ugc2tpcHBpbmcgcGFzdCBhbnkgYWRzIGJ5IHNlZWtpbmc/XG4gICAgICAgIGxldCBhZEJyZWFrcyA9IHRoaXMuX3NlZ21lbnRNYXAuZ2V0QWRCcmVha3NCZXR3ZWVuKGN1cnJlbnRUaW1lLCB0YXJnZXRUaW1lKTtcbiAgICAgICAgaWYgKGFkQnJlYWtzICYmIGFkQnJlYWtzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIC8vcGxheSBuZWFyZXN0IGFkIGJyZWFrIHRoZW4gc2tpcCB0byBvcmlnaW5hbCB0YXJnZXQgdGltZVxuICAgICAgICAgICAgdGhpcy5fdGFyZ2V0VGltZSA9IHRhcmdldFRpbWU7XG4gICAgICAgICAgICB0aGlzLl9mb3JjZWRBZEJyZWFrID0gYWRCcmVha3NbYWRCcmVha3MubGVuZ3RoIC0gMV07XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fZm9yY2VkQWRCcmVhay5zdGFydFRpbWU7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGFyZ2V0VGltZTtcbiAgICB9XG5cbiAgICBwdWJsaWMgc2V0QnJvd3NlcihzYWZhcmk6IGJvb2xlYW4sIGllOiBib29sZWFuLCBjaHJvbWU6IGJvb2xlYW4sIGZpcmVmb3g6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5faXNTYWZhcmkgPSBzYWZhcmk7XG4gICAgICAgIHRoaXMuX2lzSUUgPSBpZTtcbiAgICAgICAgdGhpcy5faXNGaXJlZm94ID0gZmlyZWZveDtcbiAgICAgICAgdGhpcy5faXNDaHJvbWUgPSBjaHJvbWU7XG4gICAgICAgIHRoaXMuX3VzaW5nQ3VzdG9tVUkgPSB0cnVlO1xuICAgIH1cblxuICAgIHByaXZhdGUgX29uVmlkZW9UaW1lVXBkYXRlKCk6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy5fYWRhcHRpdmVTb3VyY2UgJiYgdGhpcy5fdmlkZW8pIHtcbiAgICAgICAgICAgIC8vaWYgd2UgZm9yY2VkIHRoZSB1c2VyIHRvIHdhdGNoIGFuIGFkIHdoZW4gdGhleSB0cmllZCB0byBzZWVrIHBhc3QgaXQsXG4gICAgICAgICAgICAvLyB0aGlzIHdpbGwgc2VlayB0byB0aGUgZGVzaXJlZCBwb3NpdGlvbiBhZnRlciB0aGUgYWQgaXMgb3ZlclxuICAgICAgICAgICAgaWYgKHRoaXMuX2ZvcmNlZEFkQnJlYWsgJiYgdGhpcy5fdmlkZW8uY3VycmVudFRpbWUgPiB0aGlzLl9mb3JjZWRBZEJyZWFrLmVuZFRpbWUpIHtcbiAgICAgICAgICAgICAgICBsZXQgdGFyZ2V0VGltZSA9IHRoaXMuX3RhcmdldFRpbWU7XG4gICAgICAgICAgICAgICAgdGhpcy5fdGFyZ2V0VGltZSA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICB0aGlzLl9mb3JjZWRBZEJyZWFrID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIHRoaXMuX3ZpZGVvLmN1cnJlbnRUaW1lID0gdGFyZ2V0VGltZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy9pZiB0aGUgdXNlciBjbGlja3Mgb24gdGhlIHRpbWVsaW5lIHdoZW4gdXNpbmcgdGhlIGJyb3dzZXIncyBuYXRpdmUgdWksXG4gICAgICAgICAgICAvLyBpdCBjYXVzZXMgYSAndGltZXVwZGF0ZScgZXZlbnQganVzdCBiZWZvcmUgYSAnc2VlaycgZXZlbnQsIGNhdXNpbmcgdGhlXG4gICAgICAgICAgICAvLyB1cGx5bmsgcGxheWVyIHRvIHNlbGVjdCByYXkgYnkgYmFuZHdpZHRoLiB0aGUgcmVzdWx0IG9mIHRoYXQgaXMgZG93bnNoaWZ0aW5nXG4gICAgICAgICAgICAvLyB0byB0aGUgbG93ZXN0IHJheSByaWdodCBiZWZvcmUgdGhlIHNlZWsuIHRoYXQgcmF5IHR5cGljYWxseSBpc24ndCBsb2FkZWQgeWV0XG4gICAgICAgICAgICAvLyBzbyBhbiBlcnJvciBvY2N1cnMgYW5kIHRoZSBzZWVrIGZhaWxzIGNhdXNpbmcgcGxheWJhY2sgdG8gc3RvcC5cbiAgICAgICAgICAgIGlmICh0aGlzLl9hZGFwdGl2ZVNvdXJjZSAmJiB0aGlzLl92aWRlbyAmJiAhdGhpcy5fdmlkZW8uc2Vla2luZykge1xuICAgICAgICAgICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlLm9uVGltZVVwZGF0ZSgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvL2FyZSB3ZSBhdCBvciBuZWFyIHRoZSBlbmQgb2YgYSBWT0QgYXNzZXQuIHZpZGVvLmN1cnJlbnRUaW1lIGRvZXNuJ3QgYWx3YXlzIGVxdWFsIHZpZGVvLmR1cmF0aW9uIHdoZW4gdGhlIGJyb3dzZXJcbiAgICAgICAgICAgIC8vIHN0b3BzIHBsYXliYWNrIGF0IHRoZSBlbmQgb2YgYSBWT0QuXG4gICAgICAgICAgICBpZiAodGhpcy5wbGF5bGlzdFR5cGUgPT09ICdWT0QnICYmICF0aGlzLl9lbmRlZCAmJiB0aGlzLl92aWRlby5kdXJhdGlvbiAtIHRoaXMuX3ZpZGVvLmN1cnJlbnRUaW1lIDw9IDAuMjUpIHtcblxuICAgICAgICAgICAgICAgIHRoaXMuX2VuZGVkID0gdHJ1ZTtcblxuICAgICAgICAgICAgICAgIC8vZmlyZSB2aWRlby5lbmRlZCBldmVudCBtYW51YWxseVxuICAgICAgICAgICAgICAgIHZhciBldmVudCA9IG5ldyBDdXN0b21FdmVudCgnZW5kZWQnKTtcbiAgICAgICAgICAgICAgICB0aGlzLl92aWRlby5kaXNwYXRjaEV2ZW50KGV2ZW50KTtcblxuICAgICAgICAgICAgICAgIHRoaXMuX3ZpZGVvLnBhdXNlKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHdlIGNhbiByZXNwb25kIHRvIHZpZGVvIHJlc2l6ZXMgcXVpY2tseSBieSBydW5uaW5nIHdpdGhpbiBfb25WaWRlb1RpbWVVcGRhdGUoKVxuICAgICAgICAgICAgdGhpcy51cGRhdGVWaWRlb1JlY3QoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgX29uVmlkZW9TZWVraW5nKCk6IHZvaWQge1xuICAgICAgICAvL1BhdXNpbmcgZHVyaW5nIHNlZWsgc2VlbXMgdG8gaGVscCBzYWZhcmkgb3V0IHdoZW4gc2Vla2luZyBiZXlvbmQgdGhlXG4gICAgICAgIC8vZW5kIG9mIGl0J3MgdmlkZW8gYnVmZmVyLCBwZXJoYXBzIEkgd2lsbCBmaW5kIGFub3RoZXIgc29sdXRpb24gYXQgc29tZVxuICAgICAgICAvL3BvaW50LCBidXQgZm9yIG5vdyB0aGlzIGlzIHdvcmtpbmcuXG4gICAgICAgIGlmICh0aGlzLl9pc1NhZmFyaSAmJiAhKHRoaXMucGxheWxpc3RUeXBlID09IFwiRVZFTlRcIiB8fCB0aGlzLnBsYXlsaXN0VHlwZSA9PSBcIkxJVkVcIikpIHtcbiAgICAgICAgICAgIHRoaXMuX2lzUGF1c2VkID0gdGhpcy5fdmlkZW8ucGF1c2VkO1xuICAgICAgICAgICAgdGhpcy5fdmlkZW8ucGF1c2UoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgX29uVmlkZW9TZWVrZWQoKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLl9pc1NhZmFyaSAmJiAhdGhpcy5faXNQYXVzZWQgJiYgISh0aGlzLnBsYXlsaXN0VHlwZSA9PSBcIkVWRU5UXCIgfHwgdGhpcy5wbGF5bGlzdFR5cGUgPT0gXCJMSVZFXCIpKSB7XG4gICAgICAgICAgICB0aGlzLl92aWRlby5wbGF5KCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIF9vblZpZGVvUGxheWJhY2tFbmQoKTogdm9pZCB7XG4gICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlLnZpZGVvUGxheWJhY2tFbmQoKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vbk1lZGlhU291cmNlT3BlbigpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2UuaW5pdGlhbGl6ZVZpZGVvRWxlbWVudCh0aGlzLl92aWRlbywgdGhpcy5fbWVkaWFTb3VyY2UsIHRoaXMuX2NvbmZpZy5kZWJ1Zyk7XG4gICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlLmxvYWQodGhpcy5fdXJsKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vbklEM1RhZyhldmVudDogSUQzVGFnRXZlbnQpOiB2b2lkIHtcbiAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuSUQzVGFnLCBldmVudCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25UeHh4SUQzRnJhbWUoZXZlbnQ6IFR4eHhJRDNGcmFtZUV2ZW50KTogdm9pZCB7XG4gICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLlR4eHhJRDNGcmFtZSwgZXZlbnQpO1xuICAgIH1cblxuICAgIHByaXZhdGUgX29uUHJpdklEM0ZyYW1lKGV2ZW50OiBQcml2SUQzRnJhbWVFdmVudCk6IHZvaWQge1xuICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5Qcml2SUQzRnJhbWUsIGV2ZW50KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vblRleHRJRDNGcmFtZShldmVudDogVGV4dElEM0ZyYW1lRXZlbnQpOiB2b2lkIHtcbiAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuVGV4dElEM0ZyYW1lLCBldmVudCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25TbGljZUVudGVyZWQoZXZlbnQ6IFNsaWNlRXZlbnQpOiB2b2lkIHtcbiAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuU2xpY2VFbnRlcmVkLCBldmVudCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25CZWFtTG9hZGVkKCk6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy5faXNVcGx5bmtVcmwodGhpcy5fYWRhcHRpdmVTb3VyY2UuZG9tYWluKSkge1xuICAgICAgICAgICAgdGhpcy5fYXNzZXRJbmZvU2VydmljZSA9IG5ldyBBc3NldEluZm9TZXJ2aWNlKHRoaXMuX3Byb3RvY29sLCB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5kb21haW4sIHRoaXMuX2FkYXB0aXZlU291cmNlLnNlc3Npb25JZCk7XG4gICAgICAgICAgICB0aGlzLl9waW5nU2VydmljZSA9IG5ldyBQaW5nU2VydmljZSh0aGlzLl9wcm90b2NvbCwgdGhpcy5fYWRhcHRpdmVTb3VyY2UuZG9tYWluLCB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5zZXNzaW9uSWQsIHRoaXMuX3ZpZGVvKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX3ZpZGVvLnRleHRUcmFja3MuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgKGNoYW5nZVRyYWNrRXZlbnQ6IFRyYWNrRXZlbnQpID0+IHtcbiAgICAgICAgICAgIHRoaXMub25UZXh0VHJhY2tDaGFuZ2VkKGNoYW5nZVRyYWNrRXZlbnQpO1xuICAgICAgICB9KTtcblxuICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5CZWFtTG9hZGVkKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vblRyYWNrTG9hZGVkKCk6IHZvaWQge1xuICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5UcmFja0xvYWRlZCk7XG5cbiAgICAgICAgaWYgKCF0aGlzLl9maXJlZFJlYWR5RXZlbnQpIHtcbiAgICAgICAgICAgIHRoaXMuX2ZpcmVkUmVhZHlFdmVudCA9IHRydWU7XG4gICAgICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5SZWFkeSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIF9zdGFydE1haW5Mb29wKCk6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy5faW50ZXJ2YWxJZCA9PT0gMCkge1xuICAgICAgICAgICAgdGhpcy5faW50ZXJ2YWxJZCA9IHNldEludGVydmFsKHRoaXMuX29uVGltZXJUaWNrLCAxNSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIF9zdG9wTWFpbkxvb3AoKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLl9pbnRlcnZhbElkICE9PSAwKSB7XG4gICAgICAgICAgICBjbGVhckludGVydmFsKHRoaXMuX2ludGVydmFsSWQpO1xuICAgICAgICAgICAgdGhpcy5faW50ZXJ2YWxJZCA9IDA7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIF9vblRpbWVyVGljaygpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2Uub25UaWNrKCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfaXNVcGx5bmtVcmwodXJsOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICAgICAgY29uc3QgdGVtcCA9IHVybC50b0xvd2VyQ2FzZSgpO1xuICAgICAgICByZXR1cm4gdGVtcC5pbmRleE9mKCd1cGx5bmsuY29tJykgPiAtMSB8fCB0ZW1wLmluZGV4T2YoJ2Rvd25seW5rLmNvbScpID4gLTE7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25Tb3VyY2VMb2FkZWQoKTogdm9pZCB7XG4gICAgICAgIC8vcHJlLWxvYWQgc2VnbWVudCBtYXAgc28gYXNzZXRJbmZvIGRhdGEgd2lsbCBiZSBhdmFpbGFibGUgd2hlblxuICAgICAgICAvLyBuZXcgc2VnbWVudHMgYXJlIGVuY291bnRlcmVkLlxuICAgICAgICAvL0NoZWNrIGlmIHdlIGhhdmUgYW4gdXBseW5rIGFzc2V0LCBpZiBub3QuLi4uIFRoZW4ganVzdCBzdGFydCBwbGF5YmFja1xuICAgICAgICBpZiAodGhpcy5fYXNzZXRJbmZvU2VydmljZSkge1xuICAgICAgICAgICAgdGhpcy5fYXNzZXRJbmZvU2VydmljZS5sb2FkU2VnbWVudE1hcCh0aGlzLl9zZWdtZW50TWFwLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2Uuc3RhcnQoKTtcbiAgICAgICAgICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5Tb3VyY2VMb2FkZWQpO1xuXG4gICAgICAgICAgICAgICAgLy9zZXQgdGhlIHBvc3RlciB1cmxcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5fY29uZmlnLnNob3dQb3N0ZXIgJiYgdGhpcy5wbGF5bGlzdFR5cGUgPT09ICdWT0QnKSB7XG4gICAgICAgICAgICAgICAgICAgIGxldCBjb250ZW50U2VnbWVudCA9IHRoaXMuX3NlZ21lbnRNYXAuY29udGVudFNlZ21lbnRzWzBdO1xuICAgICAgICAgICAgICAgICAgICBsZXQgY29udGVudEFzc2V0ID0gdGhpcy5fYXNzZXRJbmZvU2VydmljZS5nZXRBc3NldEluZm8oY29udGVudFNlZ21lbnQuaWQpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoY29udGVudEFzc2V0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl92aWRlby5wb3N0ZXIgPSBjb250ZW50QXNzZXQucG9zdGVyVXJsO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5zdGFydCgpO1xuICAgICAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuU291cmNlTG9hZGVkKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgX29uTG9hZEVycm9yKG1lc3NhZ2U6IHN0cmluZywgY29kZTogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLkxvYWRFcnJvciwgeyBlcnJvcjogbWVzc2FnZSwgY29kZTogY29kZSB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vbkRybUVycm9yKG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQge1xuICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5Ecm1FcnJvciwgeyBlcnJvcjogbWVzc2FnZSB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vblNlZ21lbnRNYXBDaGFuZ2VkKCk6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy5wbGF5bGlzdFR5cGUgPT09IFwiVk9EXCIpIHtcbiAgICAgICAgICAgIGlmICghdGhpcy5fc2VnbWVudE1hcCkge1xuICAgICAgICAgICAgICAgIHRoaXMuX3NlZ21lbnRNYXAgPSBuZXcgU2VnbWVudE1hcCh0aGlzLl9hZGFwdGl2ZVNvdXJjZS5zZWdtZW50TWFwKTtcbiAgICAgICAgICAgICAgICB0aGlzLl9pbml0U2VnbWVudFRleHRUcmFjaygpO1xuICAgICAgICAgICAgICAgIHRoaXMuX2luaXRBZEJyZWFrVGV4dFRyYWNrKCk7XG5cbiAgICAgICAgICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5TZWdtZW50TWFwTG9hZGVkLCB7IHNlZ21lbnRNYXA6IHRoaXMuX3NlZ21lbnRNYXAgfSk7XG4gICAgICAgICAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuTG9hZGVkQWRCcmVha3MsIHsgYWRCcmVha3M6IHRoaXMuX3NlZ21lbnRNYXAuYWRCcmVha3MgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLl9zZWdtZW50TWFwID0gbmV3IFNlZ21lbnRNYXAodGhpcy5fYWRhcHRpdmVTb3VyY2Uuc2VnbWVudE1hcCk7XG4gICAgICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5TZWdtZW50TWFwTG9hZGVkLCB7IHNlZ21lbnRNYXA6IHRoaXMuX3NlZ21lbnRNYXAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIF9zdGFydExpY2Vuc2VSZXF1ZXN0KHBzc2g6c3RyaW5nLCBrc1VybDpzdHJpbmcpOiB2b2lkIHtcbiAgICAvLyAgICBjb25zb2xlLmxvZyhcIlthZGFwdGl2ZS1wbGF5ZXIudHNdIFN0YXJ0IGxpY2Vuc2UgcmVxdWVzdCBQU1NIOiBcIiArIHRoaXMuX2FkYXB0aXZlU291cmNlLnBzc2gpO1xuICAgICAgICB0aGlzLl9saWNlbnNlTWFuYWdlci5zZXRLZXlTZXJ2ZXJQcmVmaXgoa3NVcmwpO1xuICAgICAgICB0aGlzLl9saWNlbnNlTWFuYWdlci5hZGRMaWNlbnNlUmVxdWVzdChiYXNlNjRUb0J1ZmZlcihwc3NoKSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfbG9hZEJhbmR3aWR0aEhpc3RvcnkoKTogU2xpY2VEb3dubG9hZE1ldHJpY1tdW10ge1xuICAgICAgICBsZXQgaGlzdG9yeVZlcnNpb24gPSBwYXJzZUludChsb2NhbFN0b3JhZ2UuZ2V0SXRlbShcIlVwbHlua0hpc3RvcnlWZXJzaW9uXCIpLCAxMCkgfHwgMDtcbiAgICAgICAgLy8gQ3VycmVudCB2ZXJzaW9uIGlzIDIuIElmIG9sZGVyIHRoYW4gdGhhdCwgZG9uJ3QgbG9hZCBpdFxuICAgICAgICBpZiAoaGlzdG9yeVZlcnNpb24gPCAyICYmIGxvY2FsU3RvcmFnZS5nZXRJdGVtKFwiVXBseW5rSGlzdG9yeVwiKSAhPSBudWxsKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcIlthZGFwdGl2ZS1wbGF5ZXIudHNdIF9sb2FkQmFuZHdpZHRoSGlzdG9yeSBmb3VuZCBhbiBvbGRlciBoaXN0b3J5IHZlcnNpb24uIFJlbW92aW5nIGl0XCIpO1xuICAgICAgICAgICAgbG9jYWxTdG9yYWdlLnJlbW92ZUl0ZW0oXCJVcGx5bmtIaXN0b3J5XCIpO1xuICAgICAgICAgICAgbG9jYWxTdG9yYWdlLnJlbW92ZUl0ZW0oXCJVcGx5bmtIaXN0b3J5VGltZXN0YW1wXCIpO1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgbGV0IHRpbWVzdGFtcFN0ciA9IGxvY2FsU3RvcmFnZS5nZXRJdGVtKFwiVXBseW5rSGlzdG9yeVRpbWVzdGFtcFwiKTtcbiAgICAgICAgbGV0IHRpbWVzdGFtcCA9IHBhcnNlSW50KHRpbWVzdGFtcFN0ciwgMTApIHx8IDA7XG4gICAgICAgIGxldCBub3cgPSBEYXRlLm5vdygpO1xuXG4gICAgICAgIGNvbnN0IE1BWF9BR0UgPSA2MCAqIDYwICogMTAwMDsgLy8gMSBociwgaW4gbWlsbGlzZWNcbiAgICAgICAgaWYgKG5vdyAtIHRpbWVzdGFtcCA8IE1BWF9BR0UpIHtcbiAgICAgICAgICAgIGxldCBoaXN0b3J5ID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oXCJVcGx5bmtIaXN0b3J5XCIpO1xuICAgICAgICAgICAgcmV0dXJuIEpTT04ucGFyc2UoaGlzdG9yeSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfc2F2ZUJhbmR3aWR0aEhpc3RvcnkoaGlzdG9yeTogU2xpY2VEb3dubG9hZE1ldHJpY1tdW10pOiB2b2lkIHtcbiAgICAgICAgaWYgKGhpc3RvcnkgPT0gbnVsbCkgcmV0dXJuO1xuXG4gICAgICAgIGxldCB0aW1lc3RhbXAgPSBEYXRlLm5vdygpXG4gICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKFwiVXBseW5rSGlzdG9yeVZlcnNpb25cIiwgXCIyXCIpO1xuICAgICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbShcIlVwbHlua0hpc3RvcnlUaW1lc3RhbXBcIiwgdGltZXN0YW1wLnRvU3RyaW5nKCkpO1xuICAgICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbShcIlVwbHlua0hpc3RvcnlcIiwgSlNPTi5zdHJpbmdpZnkoaGlzdG9yeSkpO1xuICAgIH1cblxuICAgIGdldFRodW1ibmFpbCh0aW1lOiBudW1iZXIsIHNpemU6IFwic21hbGxcIiB8IFwibGFyZ2VcIiA9IFwic21hbGxcIik6IHRodW1iLlRodW1ibmFpbCB7XG4gICAgICAgIHJldHVybiB0aHVtYi5nZXRUaHVtYm5haWwodGltZSwgdGhpcy5fc2VnbWVudE1hcCwgdGhpcy5fYXNzZXRJbmZvU2VydmljZSwgc2l6ZSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfaW5pdFNlZ21lbnRUZXh0VHJhY2soKTogdm9pZCB7XG4gICAgICAgIGlmICh0eXBlb2YgVlRUQ3VlID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgLy9iYWlsLCBjYW4ndCBjcmVhdGUgY3Vlc1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IHNlZ21lbnRUZXh0VHJhY2sgPSB0aGlzLl9nZXRPckNyZWF0ZVRleHRUcmFjayhcIm1ldGFkYXRhXCIsIFwic2VnbWVudHNcIik7XG5cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9zZWdtZW50TWFwLmxlbmd0aDsgaSsrKSB7XG5cbiAgICAgICAgICAgIGxldCBzZWdtZW50ID0gdGhpcy5fc2VnbWVudE1hcC5nZXRTZWdtZW50QXQoaSk7XG4gICAgICAgICAgICBpZiAoc2VnbWVudCAmJiBzZWdtZW50LmlkICYmIHNlZ21lbnQuaWQgIT09ICcnKSB7XG4gICAgICAgICAgICAgICAgbGV0IGN1ZSA9IG5ldyBWVFRDdWUoc2VnbWVudC5zdGFydFRpbWUsIHNlZ21lbnQuZW5kVGltZSwgc2VnbWVudC5pZCk7XG5cbiAgICAgICAgICAgICAgICBpZiAoY3VlICE9PSB1bmRlZmluZWQpIHtcblxuICAgICAgICAgICAgICAgICAgICBjdWUuYWRkRXZlbnRMaXN0ZW5lcihcImVudGVyXCIsICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLl9hc3NldEluZm9TZXJ2aWNlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fYXNzZXRJbmZvU2VydmljZS5sb2FkU2VnbWVudChzZWdtZW50LCAoYXNzZXRJbmZvOiBBc3NldEluZm8pID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuQXNzZXRFbnRlcmVkLCB7IHNlZ21lbnQ6IHNlZ21lbnQsIGFzc2V0OiBhc3NldEluZm8gfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLkFzc2V0RW50ZXJlZCwgeyBzZWdtZW50OiBzZWdtZW50LCBhc3NldDogbnVsbCB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgY3VlLmFkZEV2ZW50TGlzdGVuZXIoXCJleGl0XCIsICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLl9hc3NldEluZm9TZXJ2aWNlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fYXNzZXRJbmZvU2VydmljZS5sb2FkU2VnbWVudChzZWdtZW50LCAoYXNzZXRJbmZvOiBBc3NldEluZm8pID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuQXNzZXRFeGl0ZWQsIHsgc2VnbWVudDogc2VnbWVudCwgYXNzZXQ6IGFzc2V0SW5mbyB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuQXNzZXRFbnRlcmVkLCB7IHNlZ21lbnQ6IHNlZ21lbnQsIGFzc2V0OiBudWxsIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgICAgICBzZWdtZW50VGV4dFRyYWNrLmFkZEN1ZShjdWUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgX2luaXRBZEJyZWFrVGV4dFRyYWNrKCk6IHZvaWQge1xuICAgICAgICBpZiAodHlwZW9mIFZUVEN1ZSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIC8vYmFpbCwgY2FuJ3QgY3JlYXRlIGN1ZXNcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBhZEJyZWFrcyA9IHRoaXMuX3NlZ21lbnRNYXAuYWRCcmVha3M7XG4gICAgICAgIGlmIChhZEJyZWFrcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCB0cmFjayA9IHRoaXMuX2dldE9yQ3JlYXRlVGV4dFRyYWNrKFwibWV0YWRhdGFcIiwgXCJhZGJyZWFrc1wiKTtcblxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGFkQnJlYWtzLmxlbmd0aDsgaSsrKSB7XG5cbiAgICAgICAgICAgIGxldCBhZEJyZWFrID0gYWRCcmVha3NbaV07XG4gICAgICAgICAgICBsZXQgY3VlID0gbmV3IFZUVEN1ZShhZEJyZWFrLnN0YXJ0VGltZSwgYWRCcmVhay5lbmRUaW1lLCBcImFkYnJlYWtcIik7XG5cbiAgICAgICAgICAgIGlmIChjdWUgIT09IHVuZGVmaW5lZCkge1xuXG4gICAgICAgICAgICAgICAgY3VlLmFkZEV2ZW50TGlzdGVuZXIoXCJlbnRlclwiLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLkFkQnJlYWtFbnRlcmVkLCB7IGFkQnJlYWs6IGFkQnJlYWsgfSk7XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICBjdWUuYWRkRXZlbnRMaXN0ZW5lcihcImV4aXRcIiwgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5BZEJyZWFrRXhpdGVkLCB7IGFkQnJlYWs6IGFkQnJlYWsgfSk7XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICB0cmFjay5hZGRDdWUoY3VlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLl9pc0ZpcmVmb3ggJiYgIXRoaXMuX3ZpZGVvLmF1dG9wbGF5ICYmIGFkQnJlYWtzWzBdLnN0YXJ0VGltZSA9PT0gMCAmJiB0aGlzLl92aWRlby5jdXJyZW50VGltZSA9PT0gMCkge1xuICAgICAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuQWRCcmVha0VudGVyZWQsIHsgYWRCcmVhazogYWRCcmVha3NbMF0gfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIF9nZXRPckNyZWF0ZVRleHRUcmFjayhraW5kOiBzdHJpbmcsIGxhYmVsOiBzdHJpbmcpOiBUZXh0VHJhY2sge1xuICAgICAgICAvL2xvb2sgZm9yIHByZXZpb3VzbHkgY3JlYXRlZCB0cmFja1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX3ZpZGVvLnRleHRUcmFja3MubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGxldCB0cmFjayA9IHRoaXMuX3ZpZGVvLnRleHRUcmFja3NbaV07XG4gICAgICAgICAgICBpZiAodHJhY2sua2luZCA9PT0ga2luZCAmJiB0cmFjay5sYWJlbCA9PT0gbGFiZWwpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJhY2s7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvL3JldHVybiBuZXcgdHJhY2tcbiAgICAgICAgcmV0dXJuIHRoaXMuX3ZpZGVvLmFkZFRleHRUcmFjayhraW5kLCBsYWJlbCk7XG4gICAgfVxuXG4gICAgcHVibGljIG9uVGV4dFRyYWNrQ2hhbmdlZChjaGFuZ2VUcmFja0V2ZW50OiBUcmFja0V2ZW50KTogdm9pZCB7XG4gICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlLm9uVGV4dFRyYWNrQ2hhbmdlZChjaGFuZ2VUcmFja0V2ZW50KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHVwZGF0ZVZpZGVvUmVjdCgpOiB2b2lkIHtcbiAgICAgICAgbGV0IGN1cnJlbnRWaWRlb1JlY3QgPSB0aGlzLl92aWRlby5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblxuICAgICAgICBpZiAoKCF0aGlzLl92aWRlb1JlY3QpIHx8ICh0aGlzLl92aWRlb1JlY3Qud2lkdGggIT0gY3VycmVudFZpZGVvUmVjdC53aWR0aCB8fCB0aGlzLl92aWRlb1JlY3QuaGVpZ2h0ICE9IGN1cnJlbnRWaWRlb1JlY3QuaGVpZ2h0KSkge1xuICAgICAgICAgICAgdGhpcy5fdmlkZW9SZWN0ID0gY3VycmVudFZpZGVvUmVjdDtcbiAgICAgICAgICAgIGlmICh0aGlzLl9hZGFwdGl2ZVNvdXJjZSAmJiB0aGlzLl9jb25maWcubGltaXRSZXNvbHV0aW9uVG9WaWV3U2l6ZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlLnNldE1heFZpZGVvUmVzb2x1dGlvbihjdXJyZW50VmlkZW9SZWN0LmhlaWdodCwgY3VycmVudFZpZGVvUmVjdC53aWR0aCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIF9vbkF1ZGlvVHJhY2tTd2l0Y2hlZCgpOiB2b2lkIHtcbiAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuQXVkaW9UcmFja1N3aXRjaGVkKTtcbiAgICB9XG5cbiAgICBnZXQgYXVkaW9UcmFja3MoKTogVXBseW5rLkF1ZGlvVHJhY2tbXSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5hdWRpb1RyYWNrcztcbiAgICB9XG5cbiAgICBnZXQgYXVkaW9UcmFjaygpOiBVcGx5bmsuQXVkaW9UcmFjayB7XG4gICAgICAgIGxldCBhdWRpb1RyYWNrcyA9IHRoaXMuYXVkaW9UcmFja3M7XG5cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhdWRpb1RyYWNrcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgaWYgKGF1ZGlvVHJhY2tzW2ldLmVuYWJsZWQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gYXVkaW9UcmFja3NbaV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBnZXQgYXVkaW9UcmFja0lkKCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5hdWRpb1RyYWNrSWQ7XG4gICAgfVxuXG4gICAgc2V0IGF1ZGlvVHJhY2tJZChpZDogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlLmF1ZGlvVHJhY2tJZCA9IGlkO1xuICAgIH1cblxuICAgIGdldCBkb21haW4oKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlU291cmNlLmRvbWFpbjtcbiAgICB9XG5cbiAgICBnZXQgc2Vzc2lvbklkKCk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5zZXNzaW9uSWQ7XG4gICAgfVxuXG4gICAgZ2V0IG51bWJlck9mUmF5cygpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVTb3VyY2UubnVtYmVyT2ZSYXlzO1xuICAgIH1cblxuICAgIGdldCBhdmFpbGFibGVCYW5kd2lkdGhzKCk6IG51bWJlcltdIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlU291cmNlLmF2YWlsYWJsZUJhbmR3aWR0aHM7XG4gICAgfVxuXG4gICAgZ2V0IGF2YWlsYWJsZVJlc29sdXRpb25zKCk6IFJlc29sdXRpb25bXSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5hdmFpbGFibGVSZXNvbHV0aW9ucztcbiAgICB9XG5cbiAgICBnZXQgYXZhaWxhYmxlTWltZVR5cGVzKCk6IE1pbWVUeXBlW10ge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVTb3VyY2UuYXZhaWxhYmxlTWltZVR5cGVzO1xuICAgIH1cblxuICAgIGdldCBzZWdtZW50TWFwKCk6IFNlZ21lbnRNYXAge1xuICAgICAgICByZXR1cm4gdGhpcy5fc2VnbWVudE1hcDtcbiAgICB9XG5cbiAgICBnZXQgYWRCcmVha3MoKTogQWRCcmVha1tdIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3NlZ21lbnRNYXAuYWRCcmVha3M7XG4gICAgfVxuXG4gICAgZ2V0IGR1cmF0aW9uKCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZVNvdXJjZSA/IHRoaXMuX2FkYXB0aXZlU291cmNlLmR1cmF0aW9uIDogMDtcbiAgICB9XG5cbiAgICBnZXQgcGxheWxpc3RUeXBlKCk6IFwiVk9EXCIgfCBcIkVWRU5UXCIgfCBcIkxJVkVcIiB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5wbGF5bGlzdFR5cGU7XG4gICAgfVxuXG4gICAgZ2V0IHN1cHBvcnRzVGh1bWJuYWlscygpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuYXZhaWxhYmxlUmVzb2x1dGlvbnMubGVuZ3RoID4gMFxuICAgIH1cblxuICAgIGdldCBjbGFzc05hbWUoKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuICdBZGFwdGl2ZVBsYXllcic7XG4gICAgfVxuXG4gICAgZ2V0IHZlcnNpb24oKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuICcwMi4wMC4xODAyMDcwMSc7IC8vd2lsbCBiZSBtb2RpZmllZCBieSB0aGUgYnVpbGQgc2NyaXB0XG4gICAgfVxuXG4gICAgZ2V0IHZpZGVvQnVmZmVyZWQoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlU291cmNlLnZpZGVvQnVmZmVyZWQ7XG4gICAgfVxuXG4gICAgZ2V0IGF1ZGlvQnVmZmVyZWQoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlU291cmNlLmF1ZGlvQnVmZmVyZWQ7XG4gICAgfVxufSIsImV4cG9ydCBjb25zdCBFdmVudHMgPSB7XG4gICAgQmVhbUxvYWRlZDogICAgICAgICAnYmVhbWxvYWRlZCcsXG4gICAgVHJhY2tMb2FkZWQ6ICAgICAgICAndHJhY2tsb2FkZWQnLFxuICAgIFNvdXJjZUxvYWRlZDogICAgICAgJ3NvdXJjZWxvYWRlZCcsXG4gICAgTG9hZEVycm9yOiAgICAgICAgICAnbG9hZGVycm9yJyxcbiAgICBEcm1FcnJvcjogICAgICAgICAgICdkcm1lcnJvcicsXG4gICAgU2VnbWVudE1hcExvYWRlZDogICAnc2VnbWVudG1hcExvYWRlZCcsXG4gICAgTG9hZGVkQWRCcmVha3M6ICAgICAnbG9hZGVkYWRicmVha3MnLFxuICAgIElEM1RhZzogICAgICAgICAgICAgJ2lkM1RhZycsXG4gICAgVHh4eElEM0ZyYW1lOiAgICAgICAndHh4eElkM0ZyYW1lJyxcbiAgICBQcml2SUQzRnJhbWU6ICAgICAgICdwcml2SWQzRnJhbWUnLFxuICAgIFRleHRJRDNGcmFtZTogICAgICAgJ3RleHRJZDNGcmFtZScsXG4gICAgU2xpY2VFbnRlcmVkOiAgICAgICAnc2xpY2VFbnRlcmVkJyxcbiAgICBBc3NldEVudGVyZWQ6ICAgICAgICdhc3NldGVudGVyZWQnLFxuICAgIEFzc2V0RXhpdGVkOiAgICAgICAgJ2Fzc2V0ZXhpdGVkJyxcbiAgICBBZEJyZWFrRW50ZXJlZDogICAgICdhZGJyZWFrZW50ZXJlZCcsXG4gICAgQWRCcmVha0V4aXRlZDogICAgICAnYWRicmVha2V4aXRlZCcsXG4gICAgUmVhZHk6ICAgICAgICAgICAgICAncmVhZHknLFxuICAgIEF1ZGlvVHJhY2tTd2l0Y2hlZDogJ2F1ZGlvVHJhY2tTd2l0Y2hlZCcsXG4gICAgQXVkaW9UcmFja0FkZGVkOiAgICAnYXVkaW9UcmFja0FkZGVkJyxcbn07IiwiaW1wb3J0IHsgc2xpY2UgfSBmcm9tICcuLi91dGlscy91dGlscyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHh4eERhdGEge1xuICAgIHR5cGU6IHN0cmluZztcbiAgICBrZXk6IHN0cmluZztcbiAgICB2YWx1ZTogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFRleHRGcmFtZSB7XG4gICAgdmFsdWU6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBUeHh4RnJhbWUge1xuICAgIGRlc2NyaXB0aW9uOiBzdHJpbmc7XG4gICAgdmFsdWU6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcml2RnJhbWUge1xuICAgIG93bmVyOiBzdHJpbmc7XG4gICAgZGF0YTogVWludDhBcnJheTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRDNGcmFtZSB7XG4gICAgdHlwZTogc3RyaW5nO1xuICAgIHNpemU6IG51bWJlcjtcbiAgICBkYXRhOiBVaW50OEFycmF5O1xufVxuXG5leHBvcnQgY2xhc3MgSUQzRGVjb2RlciB7XG5cbiAgICBzdGF0aWMgZ2V0RnJhbWUoYnVmZmVyOiBVaW50OEFycmF5KTogSUQzRnJhbWUge1xuICAgICAgICBpZiAoYnVmZmVyLmxlbmd0aCA8IDIxKSB7XG4gICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICB9XG5cbiAgICAgICAgLyogaHR0cDovL2lkMy5vcmcvaWQzdjIuMy4wXG4gICAgICAgICstLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLStcbiAgICAgICAgfCAgICAgIEhlYWRlciAoMTAgYnl0ZXMpICAgICAgfFxuICAgICAgICArLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0rXG4gICAgICAgIFswXSAgICAgPSAnSSdcbiAgICAgICAgWzFdICAgICA9ICdEJ1xuICAgICAgICBbMl0gICAgID0gJzMnXG4gICAgICAgIFszLDRdICAgPSB7VmVyc2lvbn1cbiAgICAgICAgWzVdICAgICA9IHtGbGFnc31cbiAgICAgICAgWzYtOV0gICA9IHtJRDMgU2l6ZX1cbiAgICAgICAgWzEwLTEzXSA9IHtGcmFtZSBJRH1cbiAgICAgICAgWzE0LTE3XSA9IHtGcmFtZSBTaXplfVxuICAgICAgICBbMTgsMTldID0ge0ZyYW1lIEZsYWdzfSBcbiAgICAgICAgKi9cbiAgICAgICAgaWYgKGJ1ZmZlclswXSA9PT0gNzMgJiYgIC8vIElcbiAgICAgICAgICAgIGJ1ZmZlclsxXSA9PT0gNjggJiYgIC8vIERcbiAgICAgICAgICAgIGJ1ZmZlclsyXSA9PT0gNTEpIHsgIC8vIDNcblxuICAgICAgICAgICAgbGV0IGZyYW1lVHlwZSA9IFN0cmluZy5mcm9tQ2hhckNvZGUoYnVmZmVyWzEwXSwgYnVmZmVyWzExXSwgYnVmZmVyWzEyXSwgYnVmZmVyWzEzXSk7XG5cbiAgICAgICAgICAgIGxldCBzaXplID0gMDtcbiAgICAgICAgICAgIHNpemUgPSAoYnVmZmVyWzE0XSA8PCAyNCk7XG4gICAgICAgICAgICBzaXplIHw9IChidWZmZXJbMTVdIDw8IDE2KTtcbiAgICAgICAgICAgIHNpemUgfD0gKGJ1ZmZlclsxNl0gPDwgOCk7XG4gICAgICAgICAgICBzaXplIHw9IGJ1ZmZlclsxN107XG5cbiAgICAgICAgICAgIGxldCBkYXRhID0gc2xpY2UoYnVmZmVyLCAyMCk7XG4gICAgICAgICAgICByZXR1cm4geyB0eXBlOiBmcmFtZVR5cGUsIHNpemU6IHNpemUsIGRhdGE6IGRhdGEgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgc3RhdGljIGRlY29kZVRleHRGcmFtZShpZDNGcmFtZTogSUQzRnJhbWUpOiBUZXh0RnJhbWUge1xuICAgICAgICAvKlxuICAgICAgICBGb3JtYXQ6XG4gICAgICAgIFswXSAgID0ge1RleHQgRW5jb2Rpbmd9XG4gICAgICAgIFsxLT9dID0ge1ZhbHVlfVxuICAgICAgICAqL1xuXG4gICAgICAgIGlmIChpZDNGcmFtZS5zaXplIDwgMikge1xuICAgICAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChpZDNGcmFtZS5kYXRhWzBdICE9PSAzKSB7XG4gICAgICAgICAgICAvL29ubHkgc3VwcG9ydCBVVEYtOFxuICAgICAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgbGV0IGRhdGEgPSBzbGljZShpZDNGcmFtZS5kYXRhLCAxKTtcbiAgICAgICAgcmV0dXJuIHsgdmFsdWU6IElEM0RlY29kZXIudXRmOEFycmF5VG9TdHIoZGF0YSkgfTtcbiAgICB9XG5cbiAgICBzdGF0aWMgZGVjb2RlVHh4eEZyYW1lKGlkM0ZyYW1lOiBJRDNGcmFtZSk6IFR4eHhGcmFtZSB7XG4gICAgICAgIC8qXG4gICAgICAgIEZvcm1hdDpcbiAgICAgICAgWzBdICAgPSB7VGV4dCBFbmNvZGluZ31cbiAgICAgICAgWzEtP10gPSB7RGVzY3JpcHRpb259XFwwe1ZhbHVlfVxuICAgICAgICAqL1xuXG4gICAgICAgIGlmIChpZDNGcmFtZS5zaXplIDwgMikge1xuICAgICAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChpZDNGcmFtZS5kYXRhWzBdICE9PSAzKSB7XG4gICAgICAgICAgICAvL29ubHkgc3VwcG9ydCBVVEYtOFxuICAgICAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBpbmRleCA9IDE7XG4gICAgICAgIGxldCBkZXNjcmlwdGlvbiA9IElEM0RlY29kZXIudXRmOEFycmF5VG9TdHIoc2xpY2UoaWQzRnJhbWUuZGF0YSwgaW5kZXgpKTtcblxuICAgICAgICBpbmRleCArPSBkZXNjcmlwdGlvbi5sZW5ndGggKyAxO1xuICAgICAgICBsZXQgdmFsdWUgPSBJRDNEZWNvZGVyLnV0ZjhBcnJheVRvU3RyKHNsaWNlKGlkM0ZyYW1lLmRhdGEsIGluZGV4KSk7XG5cbiAgICAgICAgcmV0dXJuIHsgZGVzY3JpcHRpb246IGRlc2NyaXB0aW9uLCB2YWx1ZTogdmFsdWUgfTtcbiAgICB9XG5cbiAgICBzdGF0aWMgZGVjb2RlUHJpdkZyYW1lKGlkM0ZyYW1lOiBJRDNGcmFtZSk6IFByaXZGcmFtZSB7XG4gICAgICAgIC8qXG4gICAgICAgIEZvcm1hdDogPHRleHQgc3RyaW5nPlxcMDxiaW5hcnkgZGF0YT5cbiAgICAgICAgKi9cblxuICAgICAgICBpZiAoaWQzRnJhbWUuc2l6ZSA8IDIpIHtcbiAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIH1cblxuICAgICAgICAvL2ZpbmQgbnVsbCB0ZXJtaW5hdG9yXG4gICAgICAgIGxldCBudWxsSW5kZXggPSAwO1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGlkM0ZyYW1lLmRhdGEubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGlmIChpZDNGcmFtZS5kYXRhW2ldID09PSAwKSB7XG4gICAgICAgICAgICAgICAgbnVsbEluZGV4ID0gaTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBvd25lciA9IFN0cmluZy5mcm9tQ2hhckNvZGUuYXBwbHkobnVsbCwgc2xpY2UoaWQzRnJhbWUuZGF0YSwgMCwgbnVsbEluZGV4KSk7XG4gICAgICAgIGxldCBwcml2YXRlRGF0YSA9IHNsaWNlKGlkM0ZyYW1lLmRhdGEsIG51bGxJbmRleCArIDEpO1xuXG4gICAgICAgIHJldHVybiB7IG93bmVyOiBvd25lciwgZGF0YTogcHJpdmF0ZURhdGEgfTtcbiAgICB9XG5cbiAgICAvLyBodHRwOi8vc3RhY2tvdmVyZmxvdy5jb20vcXVlc3Rpb25zLzg5MzY5ODQvdWludDhhcnJheS10by1zdHJpbmctaW4tamF2YXNjcmlwdC8yMjM3MzE5N1xuICAgIC8vIGh0dHA6Ly93d3cub25pY29zLmNvbS9zdGFmZi9pei9hbXVzZS9qYXZhc2NyaXB0L2V4cGVydC91dGYudHh0XG4gICAgLyogdXRmLmpzIC0gVVRGLTggPD0+IFVURi0xNiBjb252ZXJ0aW9uXG4gICAgICpcbiAgICAgKiBDb3B5cmlnaHQgKEMpIDE5OTkgTWFzYW5hbyBJenVtbyA8aXpAb25pY29zLmNvLmpwPlxuICAgICAqIFZlcnNpb246IDEuMFxuICAgICAqIExhc3RNb2RpZmllZDogRGVjIDI1IDE5OTlcbiAgICAgKiBUaGlzIGxpYnJhcnkgaXMgZnJlZS4gIFlvdSBjYW4gcmVkaXN0cmlidXRlIGl0IGFuZC9vciBtb2RpZnkgaXQuXG4gICAgICovXG4gICAgc3RhdGljIHV0ZjhBcnJheVRvU3RyKGFycmF5OiBVaW50OEFycmF5KTogc3RyaW5nIHtcblxuICAgICAgICBsZXQgY2hhcjI6IGFueTtcbiAgICAgICAgbGV0IGNoYXIzOiBhbnk7XG4gICAgICAgIGxldCBvdXQgPSBcIlwiO1xuICAgICAgICBsZXQgaSA9IDA7XG4gICAgICAgIGxldCBsZW5ndGggPSBhcnJheS5sZW5ndGg7XG5cbiAgICAgICAgd2hpbGUgKGkgPCBsZW5ndGgpIHtcbiAgICAgICAgICAgIGxldCBjID0gYXJyYXlbaSsrXTtcbiAgICAgICAgICAgIHN3aXRjaCAoYyA+PiA0KSB7XG4gICAgICAgICAgICAgICAgY2FzZSAwOlxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICAgICAgICAgIGNhc2UgMTogY2FzZSAyOiBjYXNlIDM6IGNhc2UgNDogY2FzZSA1OiBjYXNlIDY6IGNhc2UgNzpcbiAgICAgICAgICAgICAgICAgICAgLy8gMHh4eHh4eHhcbiAgICAgICAgICAgICAgICAgICAgb3V0ICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoYyk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgMTI6IGNhc2UgMTM6XG4gICAgICAgICAgICAgICAgICAgIC8vIDExMHggeHh4eCAgIDEweHggeHh4eFxuICAgICAgICAgICAgICAgICAgICBjaGFyMiA9IGFycmF5W2krK107XG4gICAgICAgICAgICAgICAgICAgIG91dCArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKCgoYyAmIDB4MUYpIDw8IDYpIHwgKGNoYXIyICYgMHgzRikpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlIDE0OlxuICAgICAgICAgICAgICAgICAgICAvLyAxMTEwIHh4eHggIDEweHggeHh4eCAgMTB4eCB4eHh4XG4gICAgICAgICAgICAgICAgICAgIGNoYXIyID0gYXJyYXlbaSsrXTtcbiAgICAgICAgICAgICAgICAgICAgY2hhcjMgPSBhcnJheVtpKytdO1xuICAgICAgICAgICAgICAgICAgICBvdXQgKz0gU3RyaW5nLmZyb21DaGFyQ29kZSgoKGMgJiAweDBGKSA8PCAxMikgfFxuICAgICAgICAgICAgICAgICAgICAgICAgKChjaGFyMiAmIDB4M0YpIDw8IDYpIHxcbiAgICAgICAgICAgICAgICAgICAgICAgICgoY2hhcjMgJiAweDNGKSA8PCAwKSk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG91dDtcbiAgICB9XG59IiwiaW1wb3J0IHsgT2JzZXJ2YWJsZSB9IGZyb20gJy4uL3V0aWxzL29ic2VydmFibGUnO1xuaW1wb3J0IHsgVHh4eERhdGEsIFR4eHhGcmFtZSwgVGV4dEZyYW1lLCBQcml2RnJhbWUsIElEM0ZyYW1lLCBJRDNEZWNvZGVyIH0gZnJvbSAnLi9pZDMtZGVjb2Rlcic7XG5pbXBvcnQgeyBiYXNlNjRUb0J1ZmZlciB9IGZyb20gJy4uL3V0aWxzL3V0aWxzJztcblxuZXhwb3J0IGludGVyZmFjZSBUeHh4SUQzRnJhbWVFdmVudCB7XG4gICAgY3VlOiBUZXh0VHJhY2tDdWU7XG4gICAgZnJhbWU6IFR4eHhGcmFtZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcml2SUQzRnJhbWVFdmVudCB7XG4gICAgY3VlOiBUZXh0VHJhY2tDdWU7XG4gICAgZnJhbWU6IFByaXZGcmFtZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBUZXh0SUQzRnJhbWVFdmVudCB7XG4gICAgY3VlOiBUZXh0VHJhY2tDdWU7XG4gICAgZnJhbWU6IFRleHRGcmFtZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRDNUYWdFdmVudCB7XG4gICAgY3VlOiBUZXh0VHJhY2tDdWU7XG4gICAgZnJhbWU6IElEM0ZyYW1lO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNsaWNlRXZlbnQge1xuICAgIGN1ZTogVGV4dFRyYWNrQ3VlO1xuICAgIGFzc2V0SWQ6IHN0cmluZztcbiAgICByYXlDaGFyOiBzdHJpbmc7XG4gICAgc2xpY2VJbmRleDogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgV2ViS2l0VHh4eEN1ZSB7XG4gICAga2V5OiBzdHJpbmc7XG4gICAgZGF0YTogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgV2ViS2l0UHJpdkN1ZSB7XG4gICAga2V5OiBzdHJpbmc7XG4gICAgaW5mbzogc3RyaW5nO1xuICAgIGRhdGE6IEFycmF5QnVmZmVyO1xufVxuXG5leHBvcnQgY2xhc3MgSUQzSGFuZGxlciBleHRlbmRzIE9ic2VydmFibGUge1xuICAgIGNvbnN0cnVjdG9yKHZpZGVvOiBIVE1MVmlkZW9FbGVtZW50KSB7XG4gICAgICAgIHN1cGVyKCk7XG4gICAgICAgIHZpZGVvLnRleHRUcmFja3MuYWRkRXZlbnRMaXN0ZW5lcignYWRkdHJhY2snLCB0aGlzLl9vbkFkZFRyYWNrLmJpbmQodGhpcykpO1xuICAgIH1cblxuICAgIHByaXZhdGUgX29uQWRkVHJhY2soYWRkVHJhY2tFdmVudDogYW55KSB7XG4gICAgICAgIGxldCB0cmFjazogVGV4dFRyYWNrID0gYWRkVHJhY2tFdmVudC50cmFjaztcbiAgICAgICAgaWYgKHRoaXMuX2lzSWQzTWV0YWRhdGFUcmFjayh0cmFjaykpIHtcbiAgICAgICAgICAgIHRyYWNrLm1vZGUgPSAnaGlkZGVuJztcbiAgICAgICAgICAgIHRyYWNrLmFkZEV2ZW50TGlzdGVuZXIoJ2N1ZWNoYW5nZScsIHRoaXMuX29uSUQzQ3VlQ2hhbmdlLmJpbmQodGhpcykpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfaXNJZDNNZXRhZGF0YVRyYWNrKHRyYWNrOiBUZXh0VHJhY2spOiBib29sZWFuIHtcbiAgICAgICAgaWYgKHRyYWNrLmtpbmQgPT0gXCJtZXRhZGF0YVwiICYmIHRyYWNrLmxhYmVsID09IFwiSUQzXCIpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRyYWNrLmtpbmQgPT0gXCJtZXRhZGF0YVwiICYmIHRyYWNrLmluQmFuZE1ldGFkYXRhVHJhY2tEaXNwYXRjaFR5cGUpIHtcbiAgICAgICAgICAgIHZhciBkaXNwYXRjaFR5cGUgPSB0cmFjay5pbkJhbmRNZXRhZGF0YVRyYWNrRGlzcGF0Y2hUeXBlO1xuICAgICAgICAgICAgcmV0dXJuIGRpc3BhdGNoVHlwZSA9PT0gXCJjb20uYXBwbGUuc3RyZWFtaW5nXCIgfHwgZGlzcGF0Y2hUeXBlID09PSBcIjE1MjYwREZGRkY0OTQ0MzMyMEZGNDk0NDMzMjAwMDBGXCI7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25JRDNDdWVDaGFuZ2UoY3VlQ2hhbmdlRXZlbnQ6IGFueSkge1xuICAgICAgICBsZXQgdHJhY2sgPSBjdWVDaGFuZ2VFdmVudC50YXJnZXQ7XG5cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0cmFjay5hY3RpdmVDdWVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBsZXQgY3VlID0gdHJhY2suYWN0aXZlQ3Vlc1tpXTtcbiAgICAgICAgICAgIGlmICghY3VlLm9uZW50ZXIpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9vbklEM0N1ZShjdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0cmFjay5jdWVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBsZXQgY3VlID0gdHJhY2suY3Vlc1tpXTtcbiAgICAgICAgICAgIGlmICghY3VlLm9uZW50ZXIpIHtcbiAgICAgICAgICAgICAgICBjdWUub25lbnRlciA9IChjdWVFdmVudDogYW55KSA9PiB7IHRoaXMuX29uSUQzQ3VlKGN1ZUV2ZW50LnRhcmdldCk7IH07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIF9vbklEM0N1ZShjdWU6IFRleHRUcmFja0N1ZSkge1xuICAgICAgICBsZXQgZGF0YTogVWludDhBcnJheSA9IHVuZGVmaW5lZDtcbiAgICAgICAgbGV0IGlkM0ZyYW1lOiBJRDNGcmFtZSA9IHVuZGVmaW5lZDtcbiAgICAgICAgbGV0IHR4eHhGcmFtZTogVHh4eEZyYW1lID0gdW5kZWZpbmVkO1xuICAgICAgICBsZXQgdGV4dEZyYW1lOiBUZXh0RnJhbWUgPSB1bmRlZmluZWQ7XG4gICAgICAgIGxldCBwcml2RnJhbWU6IFByaXZGcmFtZSA9IHVuZGVmaW5lZDtcblxuICAgICAgICBpZiAoKDxhbnk+Y3VlKS5kYXRhKSB7XG4gICAgICAgICAgICAvL21zIGVkZ2UgKG5hdGl2ZSkgcHV0cyBpZDMgZGF0YSBpbiBjdWUuZGF0YSBwcm9wZXJ0eVxuICAgICAgICAgICAgZGF0YSA9IG5ldyBVaW50OEFycmF5KCg8YW55PmN1ZSkuZGF0YSk7XG4gICAgICAgIH0gZWxzZSBpZiAoKDxhbnk+Y3VlKS52YWx1ZSAmJiAoPGFueT5jdWUpLnZhbHVlLmtleSAmJiAoPGFueT5jdWUpLnZhbHVlLmRhdGEpIHtcblxuICAgICAgICAgICAgLy9zYWZhcmkgKG5hdGl2ZSkgcHV0cyBpZDMgZGF0YSBpbiBXZWJLaXREYXRhQ3VlIG9iamVjdHMuXG4gICAgICAgICAgICAvLyBubyBlbmNvZGVkIGRhdGEgYXZhaWxhYmxlLiBzYWZhcmkgZGVjb2RlcyBmcmFtZXMgbmF0aXZlbHlcbiAgICAgICAgICAgIC8vIGkuZS5cbiAgICAgICAgICAgIC8vIHZhbHVlOiB7a2V5OiBcIlRYWFhcIiwgZGF0YTogXCI2YzM1MzdlYzMzMjQ0NjE0OWYxZDU0ZGRiZWJlYTQxNF9oXzAwMDAwMTQwXCJ9XG4gICAgICAgICAgICAvLyBvclxuICAgICAgICAgICAgLy8gdmFsdWU6IHtrZXk6IFwiUFJJVlwiLCBpbmZvOiBcImNvbS5lc3BuLmF1dGhuZXQuaGVhcnRiZWF0XCIsIGRhdGE6IEFycmF5QnVmZmVyfVxuXG4gICAgICAgICAgICBpZiAoKDxhbnk+Y3VlKS52YWx1ZS5rZXkgPT09ICdUWFhYJykge1xuICAgICAgICAgICAgICAgIGxldCB0eHh4Q3VlOiBXZWJLaXRUeHh4Q3VlID0gKDxhbnk+Y3VlKS52YWx1ZTtcbiAgICAgICAgICAgICAgICB0eHh4RnJhbWUgPSB7IHZhbHVlOiB0eHh4Q3VlLmRhdGEsIGRlc2NyaXB0aW9uOiB1bmRlZmluZWQgfTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoKDxhbnk+Y3VlKS52YWx1ZS5rZXkgPT09ICdQUklWJykge1xuICAgICAgICAgICAgICAgIGxldCBwcml2Q3VlOiBXZWJLaXRQcml2Q3VlID0gKDxhbnk+Y3VlKS52YWx1ZTtcbiAgICAgICAgICAgICAgICBwcml2RnJhbWUgPSB7IG93bmVyOiBwcml2Q3VlLmluZm8sIGRhdGE6IG5ldyBVaW50OEFycmF5KHByaXZDdWUuZGF0YSkgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vdXBseW5rIGNyZWF0ZWQgaWQzIGN1ZXNcbiAgICAgICAgICAgIGRhdGEgPSBiYXNlNjRUb0J1ZmZlcihjdWUudGV4dCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZGF0YSkge1xuICAgICAgICAgICAgaWQzRnJhbWUgPSBJRDNEZWNvZGVyLmdldEZyYW1lKGRhdGEpO1xuICAgICAgICAgICAgaWYgKGlkM0ZyYW1lKSB7XG4gICAgICAgICAgICAgICAgaWYgKGlkM0ZyYW1lLnR5cGUgPT09ICdUWFhYJykge1xuICAgICAgICAgICAgICAgICAgICB0eHh4RnJhbWUgPSBJRDNEZWNvZGVyLmRlY29kZVR4eHhGcmFtZShpZDNGcmFtZSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChpZDNGcmFtZS50eXBlID09PSAnUFJJVicpIHtcbiAgICAgICAgICAgICAgICAgICAgcHJpdkZyYW1lID0gSUQzRGVjb2Rlci5kZWNvZGVQcml2RnJhbWUoaWQzRnJhbWUpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoaWQzRnJhbWUudHlwZVswXSA9PT0gJ1QnKSB7XG4gICAgICAgICAgICAgICAgICAgIHRleHRGcmFtZSA9IElEM0RlY29kZXIuZGVjb2RlVGV4dEZyYW1lKGlkM0ZyYW1lKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaWQzRnJhbWUpIHtcbiAgICAgICAgICAgIGxldCBldmVudDogSUQzVGFnRXZlbnQgPSB7IGN1ZTogY3VlLCBmcmFtZTogaWQzRnJhbWUgfTtcbiAgICAgICAgICAgIHN1cGVyLmZpcmUoSUQzSGFuZGxlci5FdmVudC5JRDNUYWcsIGV2ZW50KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0eHh4RnJhbWUpIHtcbiAgICAgICAgICAgIGxldCB0eHh4RXZlbnQ6IFR4eHhJRDNGcmFtZUV2ZW50ID0geyBjdWU6IGN1ZSwgZnJhbWU6IHR4eHhGcmFtZSB9O1xuICAgICAgICAgICAgc3VwZXIuZmlyZShJRDNIYW5kbGVyLkV2ZW50LlR4eHhJRDNGcmFtZSwgdHh4eEV2ZW50KTtcblxuICAgICAgICAgICAgaWYgKHR4eHhGcmFtZS52YWx1ZSkge1xuICAgICAgICAgICAgICAgIGxldCBzbGljZURhdGEgPSB0eHh4RnJhbWUudmFsdWUuc3BsaXQoJ18nKTtcbiAgICAgICAgICAgICAgICBpZiAoc2xpY2VEYXRhLmxlbmd0aCA9PSAzKSB7XG4gICAgICAgICAgICAgICAgICAgIGxldCBzbGljZUV2ZW50OiBTbGljZUV2ZW50ID0geyBjdWU6IGN1ZSwgYXNzZXRJZDogc2xpY2VEYXRhWzBdLCByYXlDaGFyOiBzbGljZURhdGFbMV0sIHNsaWNlSW5kZXg6IHBhcnNlSW50KHNsaWNlRGF0YVsyXSwgMTYpIH07XG4gICAgICAgICAgICAgICAgICAgIHN1cGVyLmZpcmUoSUQzSGFuZGxlci5FdmVudC5TbGljZUVudGVyZWQsIHNsaWNlRXZlbnQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChwcml2RnJhbWUpIHtcbiAgICAgICAgICAgIGxldCBwcml2RXZlbnQ6IFByaXZJRDNGcmFtZUV2ZW50ID0geyBjdWU6IGN1ZSwgZnJhbWU6IHByaXZGcmFtZSB9O1xuICAgICAgICAgICAgc3VwZXIuZmlyZShJRDNIYW5kbGVyLkV2ZW50LlByaXZJRDNGcmFtZSwgcHJpdkV2ZW50KTtcbiAgICAgICAgfSBlbHNlIGlmICh0ZXh0RnJhbWUpIHtcbiAgICAgICAgICAgIGxldCB0ZXh0RXZlbnQ6IFRleHRJRDNGcmFtZUV2ZW50ID0geyBjdWU6IGN1ZSwgZnJhbWU6IHRleHRGcmFtZSB9O1xuICAgICAgICAgICAgc3VwZXIuZmlyZShJRDNIYW5kbGVyLkV2ZW50LlRleHRJRDNGcmFtZSwgdGV4dEV2ZW50KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHN0YXRpYyBnZXQgRXZlbnQoKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBJRDNUYWc6ICdpZDNUYWcnLFxuICAgICAgICAgICAgVHh4eElEM0ZyYW1lOiAndHh4eElkM0ZyYW1lJyxcbiAgICAgICAgICAgIFByaXZJRDNGcmFtZTogJ3ByaXZJZDNGcmFtZScsXG4gICAgICAgICAgICBUZXh0SUQzRnJhbWU6ICd0ZXh0SWQzRnJhbWUnLFxuICAgICAgICAgICAgU2xpY2VFbnRlcmVkOiAnc2xpY2VFbnRlcmVkJ1xuICAgICAgICB9O1xuICAgIH1cbn0iLCJpbXBvcnQgKiBhcyB1dGlscyBmcm9tICcuL3V0aWxzL3V0aWxzJztcblxuZXhwb3J0IGNsYXNzIExpY2Vuc2VNYW5hZ2VyRlAge1xuICAgIHByaXZhdGUgX3ZpZGVvOiBIVE1MVmlkZW9FbGVtZW50O1xuICAgIHByaXZhdGUgX2NlcnRpZmljYXRlUGF0aDogc3RyaW5nO1xuICAgIHByaXZhdGUgX2NlcnRpZmljYXRlRGF0YTogVWludDhBcnJheTtcblxuICAgIGNvbnN0cnVjdG9yKHZpZGVvOiBIVE1MVmlkZW9FbGVtZW50KSB7XG4gICAgICAgIHRoaXMuX3ZpZGVvID0gdmlkZW87XG4gICAgICAgIHRoaXMuX2NlcnRpZmljYXRlUGF0aCA9IG51bGw7XG4gICAgICAgIHRoaXMuX2NlcnRpZmljYXRlRGF0YSA9IG51bGw7XG5cbiAgICAgICAgbGV0IHNlbGYgPSB0aGlzO1xuICAgICAgICB0aGlzLl92aWRlby5hZGRFdmVudExpc3RlbmVyKCd3ZWJraXRuZWVka2V5JywgZnVuY3Rpb24oZXZlbnQ6IGFueSkgeyBzZWxmLl9vbldlYktpdE5lZWRLZXkoZXZlbnQudGFyZ2V0LCBldmVudC5pbml0RGF0YSk7IH0pO1xuICAgIH1cblxuICAgIHB1YmxpYyBsb2FkKGNlcnRpZmljYXRlUGF0aDogc3RyaW5nKSB7XG4gICAgICAgIHRoaXMuX2NlcnRpZmljYXRlUGF0aCA9IGNlcnRpZmljYXRlUGF0aDtcbiAgICAgICAgaWYgKHRoaXMuX2NlcnRpZmljYXRlUGF0aCA9PSBudWxsIHx8IHRoaXMuX2NlcnRpZmljYXRlUGF0aCA9PSBcIlwiKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiW0xpY2Vuc2VNYW5hZ2VyRlBdIE5vIEZhaXJwbGF5IGNlcnRpZmljYXRlIHBhdGggZ2l2ZW4uIENhbm5vdCBwbGF5LlwiKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGlmIChXZWJLaXRNZWRpYUtleXMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIltMaWNlbnNlTWFuYWdlckZQXSBObyBGYWlycGxheSBicm93c2VyIHN1cHBvcnQgZGV0ZWN0ZWQuIENhbm5vdCBwbGF5LlwiKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IHNlbGYgPSB0aGlzO1xuICAgICAgICBsZXQgeGhyID0gbmV3IFhNTEh0dHBSZXF1ZXN0KCk7XG4gICAgICAgIHhoci5yZXNwb25zZVR5cGUgPSAnYXJyYXlidWZmZXInO1xuICAgICAgICB4aHIub25yZWFkeXN0YXRlY2hhbmdlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKHhoci5yZWFkeVN0YXRlID09PSA0KSB7XG4gICAgICAgICAgICAgICAgaWYgKHhoci5zdGF0dXMgPT09IDIwMCkge1xuICAgICAgICAgICAgICAgICAgICBzZWxmLm9uQ2VydGlmaWNhdGVMb2FkZWQoeGhyLnJlc3BvbnNlKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyAnW0xpY2Vuc2VNYW5hZ2VyRlBdIC0gRmFpbGVkIHRvIHJldHJpZXZlIHRoZSBzZXJ2ZXIgY2VydGlmaWNhdGUgKCcgKyBzZWxmLl9jZXJ0aWZpY2F0ZVBhdGggKyAnKS4gU3RhdHVzOiAnICsgeGhyLnN0YXR1cyArICcgKCcgKyB4aHIuc3RhdHVzVGV4dCArICcpJztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHhoci5vcGVuKCdHRVQnLCB0aGlzLl9jZXJ0aWZpY2F0ZVBhdGgsIHRydWUpO1xuICAgICAgICB4aHIuc2V0UmVxdWVzdEhlYWRlcignUHJhZ21hJywgJ0NhY2hlLUNvbnRyb2w6IG5vLWNhY2hlJyk7XG4gICAgICAgIHhoci5zZXRSZXF1ZXN0SGVhZGVyKFwiQ2FjaGUtQ29udHJvbFwiLCBcIm1heC1hZ2U9MFwiKTtcbiAgICAgICAgeGhyLnNlbmQoKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIG9uQ2VydGlmaWNhdGVMb2FkZWQoZGF0YTogQXJyYXlCdWZmZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5fY2VydGlmaWNhdGVEYXRhID0gbmV3IFVpbnQ4QXJyYXkoZGF0YSk7XG4gICAgICAgIGNvbnNvbGUubG9nKFwiW0xpY2Vuc2VNYW5hZ2VyRlBdIENlcnRpZmljYXRlIGxvYWRlZCBzdWNjZXNzZnVsbHlcIik7XG5cbiAgICAgICAgLy8gdGhpcy5fdmlkZW8uc3JjIGFscmVhZHkgc2V0IGluIE5hdGl2ZVBsYXllciBjbGFzc1xuICAgICAgICB0aGlzLl92aWRlby5sb2FkKCk7XG4gICAgfVxuXG4gICAgLy8gdXNlIGB2aWRlbzogYW55YCBpbnN0ZWFkIG9mIGB2aWRlbzogSFRNTFZpZGVvRWxlbWVudGAgYmVjYXVzZSB0eXBlc2NyaXB0IGNvbXBsYWlucyBhYm91dCB3ZWJraXQqIHN0dWZmXG4gICAgcHJpdmF0ZSBfb25XZWJLaXROZWVkS2V5KHZpZGVvOiBhbnksIGluaXREYXRhOiBVaW50MTZBcnJheSk6IHZvaWQge1xuICAgICAgICBpZiAoaW5pdERhdGEgPT09IG51bGwpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlycGxheSBEUk0gbmVlZHMgYSBrZXksIGJ1dCBubyBpbml0IGRhdGEgYXZhaWxhYmxlLlwiKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5fY2VydGlmaWNhdGVEYXRhID09PSBudWxsKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpcnBsYXkgRFJNIG5lZWRzIGEga2V5LCBidXQgbm8gY2VydGlmaWNhdGUgZGF0YSBhdmFpbGFibGUuXCIpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IGRlc3RVcmwgPSB0aGlzLmdldFNQQ1VybChpbml0RGF0YSk7XG4gICAgICAgIGxldCBjb250ZW50RGF0YSA9IHRoaXMuZXh0cmFjdENvbnRlbnRJZChkZXN0VXJsKTtcbiAgICAgICAgbGV0IHNlc3Npb25EYXRhID0gdGhpcy5jb25jYXRJbml0RGF0YUlkQW5kQ2VydGlmaWNhdGUoaW5pdERhdGEsIGNvbnRlbnREYXRhKTtcblxuICAgICAgICBpZiAoIXZpZGVvLndlYmtpdEtleXMpIHtcbiAgICAgICAgICAgIGxldCBrZXlTeXN0ZW0gPSB0aGlzLnNlbGVjdEtleVN5c3RlbSgpO1xuICAgICAgICAgICAgdmlkZW8ud2Via2l0U2V0TWVkaWFLZXlzKG5ldyBXZWJLaXRNZWRpYUtleXMoa2V5U3lzdGVtKSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXZpZGVvLndlYmtpdEtleXMpXG4gICAgICAgICAgICB0aHJvdyBcIkNvdWxkIG5vdCBjcmVhdGUgTWVkaWFLZXlzXCI7XG5cbiAgICAgICAgbGV0IGtleVNlc3Npb24gPSB2aWRlby53ZWJraXRLZXlzLmNyZWF0ZVNlc3Npb24oXCJ2aWRlby9tcDRcIiwgc2Vzc2lvbkRhdGEpO1xuICAgICAgICBpZiAoIWtleVNlc3Npb24pXG4gICAgICAgICAgICB0aHJvdyBcIkNvdWxkIG5vdCBjcmVhdGUga2V5IHNlc3Npb25cIjtcbiAgICAgICAga2V5U2Vzc2lvbi5jb250ZW50SWQgPSBjb250ZW50RGF0YTtcbiAgICAgICAga2V5U2Vzc2lvbi5kZXN0aW5hdGlvblVSTCA9IGRlc3RVcmw7XG4gICAgICAgIGxldCBzZWxmID0gdGhpcztcbiAgICAgICAga2V5U2Vzc2lvbi5hZGRFdmVudExpc3RlbmVyKCd3ZWJraXRrZXltZXNzYWdlJywgZnVuY3Rpb24gKGV2ZW50OiBhbnkpIHtcbiAgICAgICAgICAgIHNlbGYubGljZW5zZVJlcXVlc3RSZWFkeShldmVudC50YXJnZXQsIGV2ZW50Lm1lc3NhZ2UpO1xuICAgICAgICB9KTtcbiAgICAgICAga2V5U2Vzc2lvbi5hZGRFdmVudExpc3RlbmVyKCd3ZWJraXRrZXlhZGRlZCcsIGZ1bmN0aW9uIChldmVudDogYW55KSB7IHNlbGYub25rZXlhZGRlZCgpOyB9KTtcbiAgICAgICAga2V5U2Vzc2lvbi5hZGRFdmVudExpc3RlbmVyKCd3ZWJraXRrZXllcnJvcicsIGZ1bmN0aW9uIChldmVudDogYW55KSB7IHNlbGYub25rZXllcnJvcigpOyB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGV4dHJhY3RDb250ZW50SWQoc3BjVXJsOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgICAgICAvLyBjb250ZW50SWQgaXMgcGFzc2VkIHVwIGFzIGEgVVJJLCBmcm9tIHdoaWNoIHRoZSBob3N0IG11c3QgYmUgZXh0cmFjdGVkOlxuICAgICAgICBsZXQgbGluayA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcbiAgICAgICAgbGluay5ocmVmID0gc3BjVXJsO1xuICAgICAgICBsZXQgcXVlcnkgPSBsaW5rLnNlYXJjaC5zdWJzdHIoMSk7XG4gICAgICAgIGxldCBpZCA9IHF1ZXJ5LnNwbGl0KFwiJlwiKTtcbiAgICAgICAgbGV0IGl0ZW0gPSBpZFswXS5zcGxpdChcIj1cIik7XG4gICAgICAgIGxldCBjaWQgPSBpdGVtWzFdO1xuICAgICAgICByZXR1cm4gY2lkO1xuICAgIH1cblxuICAgIHByaXZhdGUgZ2V0U1BDVXJsKGluaXREYXRhOiBVaW50MTZBcnJheSk6IHN0cmluZyB7XG4gICAgICAgIGxldCBza2R1cmwgPSB1dGlscy5hcnJheTE2VG9TdHJpbmcoaW5pdERhdGEpO1xuICAgICAgICAvLyBjb250ZW50SWQgaXMgcGFzc2VkIHVwIGFzIGEgVVJJLCBmcm9tIHdoaWNoIHRoZSBob3N0IG11c3QgYmUgZXh0cmFjdGVkOlxuICAgICAgICBsZXQgc3BjdXJsID0gc2tkdXJsLnJlcGxhY2UoJ3NrZDovLycsICdodHRwczovLycpO1xuICAgICAgICBzcGN1cmwgPSBzcGN1cmwuc3Vic3RyaW5nKDEsIHNwY3VybC5sZW5ndGgpO1xuICAgICAgICByZXR1cm4gc3BjdXJsO1xuICAgIH1cblxuICAgIHByaXZhdGUgY29uY2F0SW5pdERhdGFJZEFuZENlcnRpZmljYXRlKGluaXREYXRhOiBVaW50MTZBcnJheSwgaWQ6IGFueSk6IFVpbnQ4QXJyYXkge1xuICAgICAgICBpZiAodHlwZW9mIGlkID09IFwic3RyaW5nXCIpXG4gICAgICAgICAgICBpZCA9IHV0aWxzLnN0cmluZ1RvQXJyYXkxNihpZCk7XG4gICAgICAgIC8vIGxheW91dCBpcyBbaW5pdERhdGFdWzQgYnl0ZTogaWRMZW5ndGhdW2lkTGVuZ3RoIGJ5dGU6IGlkXVs0IGJ5dGU6Y2VydExlbmd0aF1bY2VydExlbmd0aCBieXRlOiBjZXJ0XVxuICAgICAgICBsZXQgb2Zmc2V0ID0gMDtcbiAgICAgICAgbGV0IGJ1ZmZlciA9IG5ldyBBcnJheUJ1ZmZlcihpbml0RGF0YS5ieXRlTGVuZ3RoICsgNCArIGlkLmJ5dGVMZW5ndGggKyA0ICsgdGhpcy5fY2VydGlmaWNhdGVEYXRhLmJ5dGVMZW5ndGgpO1xuICAgICAgICBsZXQgZGF0YVZpZXcgPSBuZXcgRGF0YVZpZXcoYnVmZmVyKTtcblxuICAgICAgICBsZXQgaW5pdERhdGFBcnJheSA9IG5ldyBVaW50OEFycmF5KGJ1ZmZlciwgb2Zmc2V0LCBpbml0RGF0YS5ieXRlTGVuZ3RoKTtcbiAgICAgICAgaW5pdERhdGFBcnJheS5zZXQoaW5pdERhdGEpO1xuICAgICAgICBvZmZzZXQgKz0gaW5pdERhdGEuYnl0ZUxlbmd0aDtcblxuICAgICAgICBkYXRhVmlldy5zZXRVaW50MzIob2Zmc2V0LCBpZC5ieXRlTGVuZ3RoLCB0cnVlKTtcbiAgICAgICAgb2Zmc2V0ICs9IDQ7XG5cbiAgICAgICAgbGV0IGlkQXJyYXkgPSBuZXcgVWludDhBcnJheShidWZmZXIsIG9mZnNldCwgaWQuYnl0ZUxlbmd0aCk7XG4gICAgICAgIGlkQXJyYXkuc2V0KGlkKTtcbiAgICAgICAgb2Zmc2V0ICs9IGlkQXJyYXkuYnl0ZUxlbmd0aDtcblxuICAgICAgICBkYXRhVmlldy5zZXRVaW50MzIob2Zmc2V0LCB0aGlzLl9jZXJ0aWZpY2F0ZURhdGEuYnl0ZUxlbmd0aCwgdHJ1ZSk7XG4gICAgICAgIG9mZnNldCArPSA0O1xuXG4gICAgICAgIGxldCBjZXJ0QXJyYXkgPSBuZXcgVWludDhBcnJheShidWZmZXIsIG9mZnNldCwgdGhpcy5fY2VydGlmaWNhdGVEYXRhLmJ5dGVMZW5ndGgpO1xuICAgICAgICBjZXJ0QXJyYXkuc2V0KHRoaXMuX2NlcnRpZmljYXRlRGF0YSk7XG5cbiAgICAgICAgcmV0dXJuIG5ldyBVaW50OEFycmF5KGJ1ZmZlciwgMCwgYnVmZmVyLmJ5dGVMZW5ndGgpO1xuICAgIH1cblxuICAgIHByaXZhdGUgc2VsZWN0S2V5U3lzdGVtKCk6IHN0cmluZyB7XG4gICAgICAgIGlmIChXZWJLaXRNZWRpYUtleXMuaXNUeXBlU3VwcG9ydGVkKFwiY29tLmFwcGxlLmZwcy4xXzBcIiwgXCJ2aWRlby9tcDRcIikpIHtcbiAgICAgICAgICAgIHJldHVybiBcImNvbS5hcHBsZS5mcHMuMV8wXCI7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyBcIktleSBTeXN0ZW0gbm90IHN1cHBvcnRlZFwiO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBsaWNlbnNlUmVxdWVzdFJlYWR5KHNlc3Npb246IGFueSwgbWVzc2FnZTogYW55KTogdm9pZCB7XG4gICAgICAgIGxldCBzZWxmID0gdGhpcztcbiAgICAgICAgbGV0IHhociA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xuICAgICAgICB4aHIucmVzcG9uc2VUeXBlID0gJ2pzb24nO1xuICAgICAgICAoeGhyIGFzIGFueSkuc2Vzc2lvbiA9IHNlc3Npb247XG4gICAgICAgIHhoci5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBpZiAoeGhyLnJlYWR5U3RhdGUgPT09IDQpIHtcbiAgICAgICAgICAgICAgICBpZiAoeGhyLnN0YXR1cyA9PT0gMjAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYubGljZW5zZVJlcXVlc3RMb2FkZWQoeGhyLnJlc3BvbnNlLCAoeGhyIGFzIGFueSkuc2Vzc2lvbik7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgbGV0IGV4ID0gSlNPTi5zdHJpbmdpZnkoc2Vzc2lvbi5yZXNwb25zZSk7XG4gICAgICAgICAgICAgICAgICAgIHRocm93ICdbTGljZW5zZU1hbmFnZXJGUF0gbGljZW5zZSByZXF1ZXN0IGZhaWxlZCAnICsgKGV4ID8gZXggOiAnJykgKyAnKCcgKyBzZXNzaW9uLmRlc3RpbmF0aW9uVVJMICsgJykuIFN0YXR1czogJyArIHhoci5zdGF0dXMgKyAnICgnICsgeGhyLnN0YXR1c1RleHQgKyAnKSc7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIGxldCBwYXlsb2FkOiBhbnkgPSB7fTtcbiAgICAgICAgcGF5bG9hZFtcInNwY1wiXSA9IHV0aWxzLmJhc2U2NEVuY29kZVVpbnQ4QXJyYXkobWVzc2FnZSk7XG4gICAgICAgIHBheWxvYWRbXCJhc3NldElkXCJdID0gc2Vzc2lvbi5jb250ZW50SWQ7XG4gICAgICAgIHhoci5vcGVuKCdQT1NUJywgc2Vzc2lvbi5kZXN0aW5hdGlvblVSTCwgdHJ1ZSk7XG4gICAgICAgIHhoci5zZW5kKEpTT04uc3RyaW5naWZ5KHBheWxvYWQpKTtcblxuICAgICAgICB3aW5kb3cuY29uc29sZS5sb2coXCJbTGljZW5zZU1hbmFnZXJGUF0gRmFpcnBsYXkga2V5IHJlcXVlc3RlZCBmb3IgYXNzZXQgXCIgKyBzZXNzaW9uLmNvbnRlbnRJZCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBsaWNlbnNlUmVxdWVzdExvYWRlZChkYXRhOiBhbnksIHNlc3Npb246IGFueSk6IHZvaWQge1xuICAgICAgICBsZXQga2V5ID0gdXRpbHMuYmFzZTY0RGVjb2RlVWludDhBcnJheShkYXRhWydja2MnXSk7XG4gICAgICAgIHNlc3Npb24udXBkYXRlKGtleSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBvbmtleWVycm9yKCk6IHZvaWQge1xuICAgICAgICB3aW5kb3cuY29uc29sZS5lcnJvcignW0xpY2Vuc2VNYW5hZ2VyRlBdIEZhaXJwbGF5IGRlY3J5cHRpb24ga2V5IGVycm9yIHdhcyBlbmNvdW50ZXJlZCcpO1xuICAgIH1cblxuICAgIHByaXZhdGUgb25rZXlhZGRlZCgpOiB2b2lkIHtcbiAgICAgICAgd2luZG93LmNvbnNvbGUubG9nKCdbTGljZW5zZU1hbmFnZXJGUF0gRmFpcnBsYXkgZGVjcnlwdGlvbiBrZXkgd2FzIGFkZGVkIHRvIHNlc3Npb24uJyk7XG4gICAgfVxufVxuIiwiaW1wb3J0ICogYXMgdXRpbHMgZnJvbSAnLi91dGlscy91dGlscyc7XG5cbmV4cG9ydCBjbGFzcyBMaWNlbnNlTWFuYWdlciB7XG5cbiAgICByZWFkb25seSBMSUNFTlNFX1RZUEVfV0lERVZJTkUgPSBcImVkZWY4YmE5LTc5ZDYtNGFjZS1hM2M4LTI3ZGNkNTFkMjFlZFwiO1xuICAgIHJlYWRvbmx5IExJQ0VOU0VfVFlQRV9QTEFZUkVBRFkgPSBcIjlhMDRmMDc5LTk4NDAtNDI4Ni1hYjkyLWU2NWJlMDg4NWY5NVwiO1xuXG4gICAgcHJpdmF0ZSBfdmlkZW86IEhUTUxWaWRlb0VsZW1lbnQ7XG4gICAgcHJpdmF0ZSBfYWRhcHRpdmVTb3VyY2U6IE1vZHVsZS5BZGFwdGl2ZVNvdXJjZTtcblxuICAgIHByaXZhdGUgX2tleVNlcnZlclByZWZpeDogc3RyaW5nO1xuICAgIHByaXZhdGUgX2xpY2Vuc2VUeXBlID0gXCJcIjtcbiAgICBwcml2YXRlIF9wc3NoOiBVaW50OEFycmF5O1xuICAgIHByaXZhdGUgX21lZGlhS2V5czogTWVkaWFLZXlzO1xuICAgIHByaXZhdGUgX3BlbmRpbmdLZXlSZXF1ZXN0czogeyBpbml0RGF0YVR5cGU6IHN0cmluZywgaW5pdERhdGE6IFVpbnQ4QXJyYXkgfVtdO1xuXG4gICAgcHVibGljIHBsYXlyZWFkeUtleVN5c3RlbSA9IHtcbiAgICAgICAga2V5U3lzdGVtOiAnY29tLm1pY3Jvc29mdC5wbGF5cmVhZHknLFxuICAgICAgICBzdXBwb3J0ZWRDb25maWc6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBpbml0RGF0YVR5cGVzOiBbJ2tleWlkcycsICdjZW5jJ10sXG4gICAgICAgICAgICAgICAgYXVkaW9DYXBhYmlsaXRpZXM6XG4gICAgICAgICAgICAgICAgICAgIFtcbiAgICAgICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb250ZW50VHlwZTogJ2F1ZGlvL21wNDsgY29kZWNzPVwibXA0YVwiJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByb2J1c3RuZXNzOiAnJ1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICAgIHZpZGVvQ2FwYWJpbGl0aWVzOlxuICAgICAgICAgICAgICAgICAgICBbXG4gICAgICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29udGVudFR5cGU6ICd2aWRlby9tcDQ7IGNvZGVjcz1cImF2YzFcIicsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcm9idXN0bmVzczogJydcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgfVxuICAgICAgICBdXG4gICAgfTtcblxuICAgIHB1YmxpYyB3aWRldmluZUtleVN5c3RlbSA9IHtcbiAgICAgICAga2V5U3lzdGVtOiAnY29tLndpZGV2aW5lLmFscGhhJyxcbiAgICAgICAgc3VwcG9ydGVkQ29uZmlnOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbGFiZWw6ICdmb28nLFxuICAgICAgICAgICAgICAgIGluaXREYXRhVHlwZXM6IFsnY2VuYyddLFxuICAgICAgICAgICAgICAgIHNlc3Npb25UeXBlczogWyd0ZW1wb3JhcnknXSxcbiAgICAgICAgICAgICAgICBhdWRpb0NhcGFiaWxpdGllczpcbiAgICAgICAgICAgICAgICAgICAgW1xuICAgICAgICAgICAgICAgICAgICAgICAgeyBjb250ZW50VHlwZTogJ2F1ZGlvL21wNDsgY29kZWNzPVwibXA0YS40MC41XCInLCByb2J1c3RuZXNzOiAnU1dfU0VDVVJFX0NSWVBUTycgfVxuICAgICAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICAgIHZpZGVvQ2FwYWJpbGl0aWVzOlxuICAgICAgICAgICAgICAgICAgICBbXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyByb2J1c3RuZXNzIEhXX1NFQ1VSRV9BTEwsIEhXX1NFQ1VSRV9ERUNPREUsIEhXX1NFQ1VSRV9DUllQVE8sIFNXX1NFQ1VSRV9ERUNPREUsIFNXX1NFQ1VSRV9DUllQVE9cbiAgICAgICAgICAgICAgICAgICAgICAgIHsgY29udGVudFR5cGU6ICd2aWRlby9tcDQ7IGNvZGVjcz1cImF2YzEuNGQwMDFmXCInLCByb2J1c3RuZXNzOiAnSFdfU0VDVVJFX0FMTCcgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHsgY29udGVudFR5cGU6ICd2aWRlby9tcDQ7IGNvZGVjcz1cImF2YzEuNGQwMDFmXCInLCByb2J1c3RuZXNzOiAnSFdfU0VDVVJFX0RFQ09ERScgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHsgY29udGVudFR5cGU6ICd2aWRlby9tcDQ7IGNvZGVjcz1cImF2YzEuNGQwMDFmXCInLCByb2J1c3RuZXNzOiAnSFdfU0VDVVJFX0NSWVBUTycgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHsgY29udGVudFR5cGU6ICd2aWRlby9tcDQ7IGNvZGVjcz1cImF2YzEuNGQwMDFmXCInLCByb2J1c3RuZXNzOiAnU1dfU0VDVVJFX0RFQ09ERScgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHsgY29udGVudFR5cGU6ICd2aWRlby9tcDQ7IGNvZGVjcz1cImF2YzEuNGQwMDFmXCInLCByb2J1c3RuZXNzOiAnU1dfU0VDVVJFX0NSWVBUTycgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHsgY29udGVudFR5cGU6ICd2aWRlby9tcDQ7IGNvZGVjcz1cImF2YzEuNGQwMDFlXCInLCByb2J1c3RuZXNzOiAnSFdfU0VDVVJFX0FMTCcgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHsgY29udGVudFR5cGU6ICd2aWRlby9tcDQ7IGNvZGVjcz1cImF2YzEuNGQwMDFlXCInLCByb2J1c3RuZXNzOiAnU1dfU0VDVVJFX0NSWVBUTycgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHsgY29udGVudFR5cGU6ICd2aWRlby9tcDQ7IGNvZGVjcz1cImF2YzEuNGQwMDE2XCInLCByb2J1c3RuZXNzOiAnSFdfU0VDVVJFX0FMTCcgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHsgY29udGVudFR5cGU6ICd2aWRlby9tcDQ7IGNvZGVjcz1cImF2YzEuNGQwMDE2XCInLCByb2J1c3RuZXNzOiAnU1dfU0VDVVJFX0NSWVBUTycgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHsgY29udGVudFR5cGU6ICd2aWRlby9tcDQ7IGNvZGVjcz1cImF2YzEuNDIwMDBkXCInLCByb2J1c3RuZXNzOiAnSFdfU0VDVVJFX0FMTCcgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHsgY29udGVudFR5cGU6ICd2aWRlby9tcDQ7IGNvZGVjcz1cImF2YzEuNDIwMDBkXCInLCByb2J1c3RuZXNzOiAnU1dfU0VDVVJFX0NSWVBUTycgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHsgY29udGVudFR5cGU6ICd2aWRlby9tcDQ7IGNvZGVjcz1cImF2YzEuNDIwMDBjXCInLCByb2J1c3RuZXNzOiAnSFdfU0VDVVJFX0FMTCcgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHsgY29udGVudFR5cGU6ICd2aWRlby9tcDQ7IGNvZGVjcz1cImF2YzEuNDIwMDBjXCInLCByb2J1c3RuZXNzOiAnU1dfU0VDVVJFX0NSWVBUTycgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHsgY29udGVudFR5cGU6ICd2aWRlby9tcDQ7IGNvZGVjcz1cImF2YzEuNDIwMDBiXCInLCByb2J1c3RuZXNzOiAnSFdfU0VDVVJFX0FMTCcgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHsgY29udGVudFR5cGU6ICd2aWRlby9tcDQ7IGNvZGVjcz1cImF2YzEuNDIwMDBiXCInLCByb2J1c3RuZXNzOiAnU1dfU0VDVVJFX0NSWVBUTycgfSxcbiAgICAgICAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgfVxuICAgICAgICBdXG4gICAgfTtcblxuICAgIGNvbnN0cnVjdG9yKHZpZGVvOiBIVE1MVmlkZW9FbGVtZW50LCBhZGFwdGl2ZVNvdXJjZTogTW9kdWxlLkFkYXB0aXZlU291cmNlKSB7XG4gICAgICAgIC8vICAgIGNvbnNvbGUubG9nKFwiTGljZW5zZU1hbmFnZXIgQ1RPUlwiKTtcbiAgICAgICAgdGhpcy5fdmlkZW8gPSB2aWRlbztcbiAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2UgPSBhZGFwdGl2ZVNvdXJjZTtcbiAgICAgICAgdGhpcy5fa2V5U2VydmVyUHJlZml4ID0gbnVsbDtcbiAgICAgICAgdGhpcy5fcHNzaCA9IG51bGw7XG4gICAgICAgIHRoaXMuX21lZGlhS2V5cyA9IG51bGw7XG4gICAgICAgIHRoaXMuX3BlbmRpbmdLZXlSZXF1ZXN0cyA9IFtdO1xuICAgICAgICB0aGlzLl9wZW5kaW5nS2V5UmVxdWVzdHMgPSBbXTtcbiAgICAgICAgdGhpcy5pbml0TWVkaWFLZXlzKCk7XG4gICAgfVxuXG4gICAgcHVibGljIGFkZExpY2Vuc2VSZXF1ZXN0KHBzc2hEYXRhOiBVaW50OEFycmF5KSB7XG4gICAgICAgIC8vICAgIGNvbnNvbGUubG9nKFwiTGljZW5zZU1hbmFnZXIgLSBSZXF1ZXN0aW5nIGxpY2Vuc2UgZm9yIERSTSBwbGF5YmFja1wiKTtcbiAgICAgICAgdGhpcy5fcGVuZGluZ0tleVJlcXVlc3RzLnB1c2goeyBpbml0RGF0YVR5cGU6ICdjZW5jJywgaW5pdERhdGE6IHBzc2hEYXRhIH0pO1xuICAgICAgICB0aGlzLnByb2Nlc3NQZW5kaW5nS2V5cyh0aGlzKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgc2V0S2V5U2VydmVyUHJlZml4KGtleVNlcnZlclByZWZpeDogc3RyaW5nKSB7XG4gICAgICAgIC8vICAgIGNvbnNvbGUubG9nKFwiS2V5U2VydmVyUHJlZml4OiBcIiArIGtleVNlcnZlclByZWZpeCk7XG4gICAgICAgIHRoaXMuX2tleVNlcnZlclByZWZpeCA9IGtleVNlcnZlclByZWZpeDtcbiAgICB9XG5cbiAgICBwcml2YXRlIGluaXRNZWRpYUtleXMoKSB7XG4gICAgICAgIC8vICAgIGNvbnNvbGUubG9nKFwiW2luaXRNZWRpYUtleXNdXCIpO1xuICAgICAgICBsZXQgc2VsZiA9IHRoaXM7XG4gICAgICAgIHRoaXMuX21lZGlhS2V5cyA9IG51bGw7XG5cbiAgICAgICAgaWYgKG5hdmlnYXRvci5yZXF1ZXN0TWVkaWFLZXlTeXN0ZW1BY2Nlc3MpIHtcbiAgICAgICAgICAgIG5hdmlnYXRvci5yZXF1ZXN0TWVkaWFLZXlTeXN0ZW1BY2Nlc3Moc2VsZi53aWRldmluZUtleVN5c3RlbS5rZXlTeXN0ZW0sIHNlbGYud2lkZXZpbmVLZXlTeXN0ZW0uc3VwcG9ydGVkQ29uZmlnKVxuICAgICAgICAgICAgICAgIC50aGVuKGZ1bmN0aW9uIChrZXlTeXN0ZW1BY2Nlc3MpIHtcblxuICAgICAgICAgICAgICAgICAgICBzZWxmLl9saWNlbnNlVHlwZSA9IHNlbGYuTElDRU5TRV9UWVBFX1dJREVWSU5FO1xuICAgICAgICAgICAgICAgICAgICBzZWxmLl9hZGFwdGl2ZVNvdXJjZS5hZGRTdXBwb3J0ZWRQcm90ZWN0aW9uU2NoZW1lKHNlbGYuTElDRU5TRV9UWVBFX1dJREVWSU5FKTtcblxuICAgICAgICAgICAgICAgICAgICBrZXlTeXN0ZW1BY2Nlc3MuY3JlYXRlTWVkaWFLZXlzKClcbiAgICAgICAgICAgICAgICAgICAgICAgIC50aGVuKGZ1bmN0aW9uIChjcmVhdGVkTWVkaWFLZXlzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5vbk1lZGlhS2V5QWNxdWlyZWQoc2VsZiwgY3JlYXRlZE1lZGlhS2V5cyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcblxuICAgICAgICAgICAgICAgICAgICBuYXZpZ2F0b3IucmVxdWVzdE1lZGlhS2V5U3lzdGVtQWNjZXNzKHNlbGYucGxheXJlYWR5S2V5U3lzdGVtLmtleVN5c3RlbSwgc2VsZi5wbGF5cmVhZHlLZXlTeXN0ZW0uc3VwcG9ydGVkQ29uZmlnKVxuICAgICAgICAgICAgICAgICAgICAgICAgLnRoZW4oZnVuY3Rpb24gKGtleVN5c3RlbUFjY2Vzcykge1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5fbGljZW5zZVR5cGUgPSBzZWxmLkxJQ0VOU0VfVFlQRV9QTEFZUkVBRFk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5fYWRhcHRpdmVTb3VyY2UuYWRkU3VwcG9ydGVkUHJvdGVjdGlvblNjaGVtZShzZWxmLkxJQ0VOU0VfVFlQRV9QTEFZUkVBRFkpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAga2V5U3lzdGVtQWNjZXNzLmNyZWF0ZU1lZGlhS2V5cygpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC50aGVuKGZ1bmN0aW9uIChjcmVhdGVkTWVkaWFLZXlzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWxmLm9uTWVkaWFLZXlBY3F1aXJlZChzZWxmLCBjcmVhdGVkTWVkaWFLZXlzKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAgICAgICAuY2F0Y2goZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYuX2FkYXB0aXZlU291cmNlLnNpZ25hbERybUVycm9yKCdMaWNlbnNlTWFuYWdlciAtIFlvdXIgYnJvd3Nlci9zeXN0ZW0gZG9lcyBub3Qgc3VwcG9ydCB0aGUgcmVxdWVzdGVkIGNvbmZpZ3VyYXRpb25zIGZvciBwbGF5aW5nIHByb3RlY3RlZCBjb250ZW50LicpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAuY2F0Y2goZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICAgICAgICBzZWxmLl9hZGFwdGl2ZVNvdXJjZS5zaWduYWxEcm1FcnJvcignTGljZW5zZU1hbmFnZXIgLSBZb3VyIGJyb3dzZXIvc3lzdGVtIGRvZXMgbm90IHN1cHBvcnQgdGhlIHJlcXVlc3RlZCBjb25maWd1cmF0aW9ucyBmb3IgcGxheWluZyBwcm90ZWN0ZWQgY29udGVudC4nKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgb25NZWRpYUtleUFjcXVpcmVkKHNlbGY6IExpY2Vuc2VNYW5hZ2VyLCBjcmVhdGVkTWVkaWFLZXlzOiBNZWRpYUtleXMpIHtcbiAgICAgICAgLy8gICAgY29uc29sZS5sb2coXCJbb25NZWRpYUtleUFjcXVpcmVkXVwiKTtcblxuICAgICAgICBzZWxmLl9tZWRpYUtleXMgPSBjcmVhdGVkTWVkaWFLZXlzO1xuICAgICAgICBzZWxmLl92aWRlby5zZXRNZWRpYUtleXMoc2VsZi5fbWVkaWFLZXlzKTtcbiAgICAgICAgc2VsZi5wcm9jZXNzUGVuZGluZ0tleXMoc2VsZik7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBwcm9jZXNzUGVuZGluZ0tleXMoc2VsZjogTGljZW5zZU1hbmFnZXIpIHtcbiAgICAgICAgLy8gICAgY29uc29sZS5sb2coXCJbcHJvY2Vzc1BlbmRpbmdLZXlzXVwiKTtcblxuICAgICAgICBpZiAoc2VsZi5fbWVkaWFLZXlzID09PSBudWxsKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB3aGlsZSAoc2VsZi5fcGVuZGluZ0tleVJlcXVlc3RzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGxldCBkYXRhID0gc2VsZi5fcGVuZGluZ0tleVJlcXVlc3RzLnNoaWZ0KCk7IC8vIHBvcCBmaXJzdCBlbGVtZW50XG4gICAgICAgICAgICBzZWxmLmdldE5ld0tleVNlc3Npb24oZGF0YS5pbml0RGF0YVR5cGUsIGRhdGEuaW5pdERhdGEpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBnZXROZXdLZXlTZXNzaW9uKGluaXREYXRhVHlwZTogc3RyaW5nLCBpbml0RGF0YTogVWludDhBcnJheSkge1xuICAgICAgICAvLyAgICBjb25zb2xlLmxvZyhcIltnZXROZXdLZXlTZXNzaW9uXVwiKTtcblxuICAgICAgICBsZXQgc2VsZiA9IHRoaXM7XG4gICAgICAgIGxldCBrZXlTZXNzaW9uID0gc2VsZi5fbWVkaWFLZXlzLmNyZWF0ZVNlc3Npb24oXCJ0ZW1wb3JhcnlcIik7XG4gICAgICAgIGtleVNlc3Npb24uYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIGZ1bmN0aW9uIChldmVudDogTWVkaWFLZXlNZXNzYWdlRXZlbnQpIHtcbiAgICAgICAgICAgIC8vY29uc29sZS5sb2coJ29ubWVzc2FnZSAsIG1lc3NhZ2UgdHlwZTogJyArIGV2ZW50Lm1lc3NhZ2VUeXBlKTtcblxuICAgICAgICAgICAgc2VsZi5kb3dubG9hZE5ld0tleShzZWxmLmdldExpY2Vuc2VVcmwoKSwgZXZlbnQubWVzc2FnZSwgZnVuY3Rpb24gKGRhdGE6IEFycmF5QnVmZmVyKSB7XG5cbiAgICAgICAgICAgICAgICAvLyBjb25zb2xlLmxvZygnZXZlbnQudGFyZ2V0LnVwZGF0ZSwgZGF0YSBieXRlczogJyArIGRhdGEuYnl0ZUxlbmd0aCk7XG5cbiAgICAgICAgICAgICAgICB2YXIgcHJvbSA9IDxQcm9taXNlPHZvaWQ+Pig8TWVkaWFLZXlTZXNzaW9uPmV2ZW50LnRhcmdldCkudXBkYXRlKGRhdGEpO1xuICAgICAgICAgICAgICAgIHByb20uY2F0Y2goZnVuY3Rpb24gKGU6IHN0cmluZykge1xuICAgICAgICAgICAgICAgICAgICBzZWxmLl9hZGFwdGl2ZVNvdXJjZS5zaWduYWxEcm1FcnJvcignTGljZW5zZU1hbmFnZXIgLSBjYWxsIHRvIE1lZGlhS2V5U2Vzc2lvbi51cGRhdGUoKSBmYWlsZWQ6ICcgKyBlKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAvLyBjb25zb2xlLmxvZyhcIkxpY2Vuc2VNYW5hZ2VyIC0gZmluaXNoZWQgbGljZW5zZSB1cGRhdGUgZm9yIERSTSBwbGF5YmFja1wiKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9LCBmYWxzZSk7XG5cbiAgICAgICAgbGV0IHJlcVByb21pc2UgPSA8UHJvbWlzZTx2b2lkPj5rZXlTZXNzaW9uLmdlbmVyYXRlUmVxdWVzdChpbml0RGF0YVR5cGUsIGluaXREYXRhKTtcbiAgICAgICAgcmVxUHJvbWlzZS5jYXRjaChmdW5jdGlvbiAoZTogc3RyaW5nKSB7XG4gICAgICAgICAgICBzZWxmLl9hZGFwdGl2ZVNvdXJjZS5zaWduYWxEcm1FcnJvcignTGljZW5zZU1hbmFnZXIgLSBrZXlTZXNzaW9uLmdlbmVyYXRlUmVxdWVzdCgpIGZhaWxlZDogJyArIGUpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGdldExpY2Vuc2VVcmwoKSB7XG4gICAgICAgIGlmICh0aGlzLl9saWNlbnNlVHlwZSA9PT0gdGhpcy5MSUNFTlNFX1RZUEVfUExBWVJFQURZKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fa2V5U2VydmVyUHJlZml4ICsgXCIvcHJcIjtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICh0aGlzLl9saWNlbnNlVHlwZSA9PT0gdGhpcy5MSUNFTlNFX1RZUEVfV0lERVZJTkUpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9rZXlTZXJ2ZXJQcmVmaXggKyBcIi93dlwiO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAnJztcbiAgICB9XG5cbiAgICBwcml2YXRlIGRvd25sb2FkTmV3S2V5KHVybDogc3RyaW5nLCBrZXlNZXNzYWdlOiBBcnJheUJ1ZmZlciwgY2FsbGJhY2s6IGFueSkge1xuICAgICAgICAvLyAgICBjb25zb2xlLmxvZygnZG93bmxvYWROZXdLZXkgKHhocik6ICcgKyB1cmwpO1xuXG4gICAgICAgIGxldCBzZWxmID0gdGhpcztcblxuICAgICAgICBsZXQgY2hhbGxlbmdlOiBBcnJheUJ1ZmZlcjtcbiAgICAgICAgbGV0IHhociA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xuICAgICAgICB4aHIub3BlbignUE9TVCcsIHVybCwgdHJ1ZSk7XG4gICAgICAgIHhoci53aXRoQ3JlZGVudGlhbHMgPSB0cnVlO1xuICAgICAgICB4aHIucmVzcG9uc2VUeXBlID0gJ2FycmF5YnVmZmVyJztcbiAgICAgICAgeGhyLm9ucmVhZHlzdGF0ZWNoYW5nZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGlmICh4aHIucmVhZHlTdGF0ZSA9PT0gNCkge1xuICAgICAgICAgICAgICAgIGlmICh4aHIuc3RhdHVzID09PSAyMDApIHtcbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2soeGhyLnJlc3BvbnNlKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBzZWxmLl9hZGFwdGl2ZVNvdXJjZS5zaWduYWxEcm1FcnJvcignTGljZW5zZU1hbmFnZXIgLSBYSFIgZmFpbGVkICgnICsgdXJsICsgJykuIFN0YXR1czogJyArIHhoci5zdGF0dXMgKyAnICgnICsgeGhyLnN0YXR1c1RleHQgKyAnKScpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgaWYgKHRoaXMuX2xpY2Vuc2VUeXBlID09PSB0aGlzLkxJQ0VOU0VfVFlQRV9QTEFZUkVBRFkpIHtcbiAgICAgICAgICAgIC8vIEZvciBQbGF5UmVhZHkgQ0RNcywgd2UgbmVlZCB0byBkaWcgdGhlIENoYWxsZW5nZSBvdXQgb2YgdGhlIFhNTC5cbiAgICAgICAgICAgIHZhciBrZXlNZXNzYWdlWG1sID0gbmV3IERPTVBhcnNlcigpLnBhcnNlRnJvbVN0cmluZyhTdHJpbmcuZnJvbUNoYXJDb2RlLmFwcGx5KG51bGwsIG5ldyBVaW50MTZBcnJheShrZXlNZXNzYWdlKSksICdhcHBsaWNhdGlvbi94bWwnKTtcbiAgICAgICAgICAgIGlmIChrZXlNZXNzYWdlWG1sLmdldEVsZW1lbnRzQnlUYWdOYW1lKCdDaGFsbGVuZ2UnKVswXSkge1xuICAgICAgICAgICAgICAgIGNoYWxsZW5nZSA9IHV0aWxzLmJhc2U2NFRvQnVmZmVyKGtleU1lc3NhZ2VYbWwuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ0NoYWxsZW5nZScpWzBdLmNoaWxkTm9kZXNbMF0ubm9kZVZhbHVlKS5idWZmZXI7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHNlbGYuX2FkYXB0aXZlU291cmNlLnNpZ25hbERybUVycm9yKCdDYW5ub3QgZmluZCA8Q2hhbGxlbmdlPiBpbiBrZXkgbWVzc2FnZScpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIGhlYWRlck5hbWVzID0ga2V5TWVzc2FnZVhtbC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnbmFtZScpO1xuICAgICAgICAgICAgdmFyIGhlYWRlclZhbHVlcyA9IGtleU1lc3NhZ2VYbWwuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ3ZhbHVlJyk7XG4gICAgICAgICAgICBpZiAoaGVhZGVyTmFtZXMubGVuZ3RoICE9PSBoZWFkZXJWYWx1ZXMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fYWRhcHRpdmVTb3VyY2Uuc2lnbmFsRHJtRXJyb3IoJ01pc21hdGNoZWQgaGVhZGVyIDxuYW1lPi88dmFsdWU+IHBhaXIgaW4ga2V5IG1lc3NhZ2UnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgaGVhZGVyTmFtZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICB4aHIuc2V0UmVxdWVzdEhlYWRlcihoZWFkZXJOYW1lc1tpXS5jaGlsZE5vZGVzWzBdLm5vZGVWYWx1ZSwgaGVhZGVyVmFsdWVzW2ldLmNoaWxkTm9kZXNbMF0ubm9kZVZhbHVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICh0aGlzLl9saWNlbnNlVHlwZSA9PT0gdGhpcy5MSUNFTlNFX1RZUEVfV0lERVZJTkUpIHtcbiAgICAgICAgICAgIC8vIEZvciBXaWRldmluZSBDRE1zLCB0aGUgY2hhbGxlbmdlIGlzIHRoZSBrZXlNZXNzYWdlLlxuICAgICAgICAgICAgY2hhbGxlbmdlID0ga2V5TWVzc2FnZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHhoci5zZW5kKGNoYWxsZW5nZSk7XG4gICAgfVxufVxuIiwiaW1wb3J0IHsgT2JzZXJ2YWJsZSB9IGZyb20gJy4vdXRpbHMvb2JzZXJ2YWJsZSc7XG5pbXBvcnQgeyBFdmVudHMgfSBmcm9tICcuL2V2ZW50cyc7XG5pbXBvcnQgeyBQbGF5ZXIsIFJlc29sdXRpb24sIE1pbWVUeXBlIH0gZnJvbSAnLi9wbGF5ZXInO1xuaW1wb3J0ICogYXMgdGh1bWIgZnJvbSAnLi91dGlscy90aHVtYm5haWwtaGVscGVyJztcbmltcG9ydCB7IFNlZ21lbnRNYXAgfSBmcm9tICcuL3V0aWxzL3NlZ21lbnQtbWFwJztcbmltcG9ydCB7IEFkQnJlYWsgfSBmcm9tICcuL2FkL2FkLWJyZWFrJztcbmltcG9ydCB7IElEM0hhbmRsZXIsIElEM1RhZ0V2ZW50LCBUeHh4SUQzRnJhbWVFdmVudCwgUHJpdklEM0ZyYW1lRXZlbnQsIFRleHRJRDNGcmFtZUV2ZW50LCBTbGljZUV2ZW50IH0gZnJvbSAnLi9pZDMvaWQzLWhhbmRsZXInO1xuaW1wb3J0IHsgSUQzRGF0YSB9IGZyb20gJy4vaWQzL2lkMy1kYXRhJztcbmltcG9ydCB7IEFzc2V0SW5mbywgQXNzZXRJbmZvU2VydmljZSB9IGZyb20gJy4vd2ViLXNlcnZpY2VzL2Fzc2V0LWluZm8tc2VydmljZSc7XG5pbXBvcnQgeyBQaW5nU2VydmljZSB9IGZyb20gJy4vd2ViLXNlcnZpY2VzL3Bpbmctc2VydmljZSc7XG5pbXBvcnQgeyBnZXRQcm90b2NvbCB9IGZyb20gJy4vdXRpbHMvdXRpbHMnO1xuaW1wb3J0IHsgTGljZW5zZU1hbmFnZXJGUCB9IGZyb20gJy4vbGljZW5zZS1tYW5hZ2VyLWZwJztcblxuZXhwb3J0IGNsYXNzIE5hdGl2ZVBsYXllciBleHRlbmRzIE9ic2VydmFibGUgaW1wbGVtZW50cyBQbGF5ZXIge1xuICAgIHByaXZhdGUgX3ZpZGVvOiBIVE1MVmlkZW9FbGVtZW50O1xuICAgIHByaXZhdGUgX3VybDogc3RyaW5nO1xuICAgIHByaXZhdGUgX3BsYXlsaXN0VHlwZTogXCJWT0RcIiB8IFwiRVZFTlRcIiB8IFwiTElWRVwiO1xuICAgIHByaXZhdGUgX2lkM0hhbmRsZXI6IElEM0hhbmRsZXI7XG4gICAgcHJpdmF0ZSBfZmlyZWRSZWFkeUV2ZW50OiBib29sZWFuO1xuICAgIHByaXZhdGUgX2Fzc2V0SW5mb1NlcnZpY2U6IEFzc2V0SW5mb1NlcnZpY2U7XG4gICAgcHJpdmF0ZSBfcGluZ1NlcnZpY2U6IFBpbmdTZXJ2aWNlO1xuICAgIHByaXZhdGUgX3Nlc3Npb25JZDogc3RyaW5nO1xuICAgIHByaXZhdGUgX2RvbWFpbjogc3RyaW5nO1xuICAgIHByaXZhdGUgX2N1cnJlbnRBc3NldElkOiBzdHJpbmc7XG4gICAgcHJpdmF0ZSBfY29uZmlnOiBQbGF5ZXJPcHRpb25zO1xuICAgIHByaXZhdGUgX2luQWRCcmVhazogYm9vbGVhbjtcbiAgICBwcml2YXRlIF9jdXJyZW50QWRCcmVhazogQWRCcmVhaztcbiAgICBwcml2YXRlIF9wcm90b2NvbDogc3RyaW5nO1xuICAgIHByaXZhdGUgX2xpY2Vuc2VNYW5hZ2VyRlA6IExpY2Vuc2VNYW5hZ2VyRlA7XG5cbiAgICAvL2RvIG5vdGhpbmcgcHJvcGVydGllc1xuICAgIHJlYWRvbmx5IG51bWJlck9mUmF5czogbnVtYmVyO1xuICAgIHJlYWRvbmx5IGF2YWlsYWJsZUJhbmR3aWR0aHM6IG51bWJlcltdO1xuICAgIHJlYWRvbmx5IGF2YWlsYWJsZVJlc29sdXRpb25zOiBSZXNvbHV0aW9uW107XG4gICAgcmVhZG9ubHkgYXZhaWxhYmxlTWltZVR5cGVzOiBNaW1lVHlwZVtdO1xuICAgIHJlYWRvbmx5IHNlZ21lbnRNYXA6IFNlZ21lbnRNYXA7XG4gICAgcmVhZG9ubHkgYWRCcmVha3M6IEFkQnJlYWtbXTtcbiAgICByZWFkb25seSBpc0F1ZGlvT25seTogYm9vbGVhbjtcblxuICAgIHByaXZhdGUgcmVhZG9ubHkgX2RlZmF1bHRzOiBQbGF5ZXJPcHRpb25zID0ge1xuICAgICAgICBkaXNhYmxlU2Vla0R1cmluZ0FkQnJlYWs6IHRydWUsXG4gICAgICAgIHNob3dQb3N0ZXI6IGZhbHNlLFxuICAgICAgICBkZWJ1ZzogZmFsc2VcbiAgICB9O1xuXG4gICAgY29uc3RydWN0b3IodmlkZW86IEhUTUxWaWRlb0VsZW1lbnQsIG9wdGlvbnM/OiBQbGF5ZXJPcHRpb25zKSB7XG4gICAgICAgIHN1cGVyKCk7XG5cbiAgICAgICAgLy9pbml0IGNvbmZpZ1xuICAgICAgICB2YXIgZGF0YSA9IHt9O1xuXG4gICAgICAgIC8vdHJ5IHBhcnNpbmcgZGF0YSBhdHRyaWJ1dGUgY29uZmlnXG4gICAgICAgIHRyeSB7IGRhdGEgPSBKU09OLnBhcnNlKHZpZGVvLmdldEF0dHJpYnV0ZSgnZGF0YS1jb25maWcnKSk7IH1cbiAgICAgICAgY2F0Y2ggKGUpIHsgfVxuXG4gICAgICAgIC8vbWVyZ2UgZGVmYXVsdHMgd2l0aCB1c2VyIG9wdGlvbnNcbiAgICAgICAgdGhpcy5fY29uZmlnID0gT2JqZWN0LmFzc2lnbih7fSwgdGhpcy5fZGVmYXVsdHMsIG9wdGlvbnMsIGRhdGEpO1xuXG4gICAgICAgIHRoaXMuX3ZpZGVvID0gdmlkZW87XG4gICAgICAgIHRoaXMuX2lkM0hhbmRsZXIgPSBuZXcgSUQzSGFuZGxlcih2aWRlbyk7XG4gICAgICAgIHRoaXMuX2lkM0hhbmRsZXIub24oSUQzSGFuZGxlci5FdmVudC5JRDNUYWcsIHRoaXMuX29uSUQzVGFnLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLl9pZDNIYW5kbGVyLm9uKElEM0hhbmRsZXIuRXZlbnQuVHh4eElEM0ZyYW1lLCB0aGlzLl9vblR4eHhJRDNGcmFtZS5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5faWQzSGFuZGxlci5vbihJRDNIYW5kbGVyLkV2ZW50LlByaXZJRDNGcmFtZSwgdGhpcy5fb25Qcml2SUQzRnJhbWUuYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuX2lkM0hhbmRsZXIub24oSUQzSGFuZGxlci5FdmVudC5UZXh0SUQzRnJhbWUsIHRoaXMuX29uVGV4dElEM0ZyYW1lLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLl9pZDNIYW5kbGVyLm9uKElEM0hhbmRsZXIuRXZlbnQuU2xpY2VFbnRlcmVkLCB0aGlzLl9vblNsaWNlRW50ZXJlZC5iaW5kKHRoaXMpKTtcblxuICAgICAgICB0aGlzLl9vbkR1cmF0aW9uQ2hhbmdlID0gdGhpcy5fb25EdXJhdGlvbkNoYW5nZS5iaW5kKHRoaXMpO1xuXG4gICAgICAgIHRoaXMuX292ZXJyaWRlQ3VycmVudFRpbWUoKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHByZXBhcmVMb2FkKHVybDogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIHRoaXMuX3Byb3RvY29sID0gZ2V0UHJvdG9jb2wodXJsKTtcblxuICAgICAgICB0aGlzLl9maXJlZFJlYWR5RXZlbnQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fY3VycmVudEFzc2V0SWQgPSBudWxsO1xuXG4gICAgICAgIHRoaXMuX3ZpZGVvLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2R1cmF0aW9uY2hhbmdlJywgdGhpcy5fb25EdXJhdGlvbkNoYW5nZSk7XG4gICAgICAgIHRoaXMuX3ZpZGVvLmFkZEV2ZW50TGlzdGVuZXIoJ2R1cmF0aW9uY2hhbmdlJywgdGhpcy5fb25EdXJhdGlvbkNoYW5nZSk7XG4gICAgICAgIHRoaXMuX3ZpZGVvLmF1ZGlvVHJhY2tzLmFkZEV2ZW50TGlzdGVuZXIoJ2FkZHRyYWNrJywgdGhpcy5fb25BdWRpb1RyYWNrQWRkZWQuYmluZCh0aGlzKSk7XG5cbiAgICAgICAgLy9zZXNzaW9uSWQgKD9wYnM9KSBtYXkgb3IgbWF5IG5vdCBiZSBwYXJ0IG9mIHRoZSB1cmxcbiAgICAgICAgdGhpcy5fc2Vzc2lvbklkID0gdGhpcy5fZ2V0U2Vzc2lvbklkKHVybCk7XG4gICAgICAgIHRoaXMuX2RvbWFpbiA9IHRoaXMuX2dldERvbWFpbih1cmwpO1xuXG4gICAgICAgIHRoaXMuX2xpY2Vuc2VNYW5hZ2VyRlAgPSBuZXcgTGljZW5zZU1hbmFnZXJGUCh0aGlzLl92aWRlbyk7XG5cbiAgICAgICAgaWYgKHRoaXMuX2lzVXBseW5rVXJsKHVybCkpIHtcbiAgICAgICAgICAgIHRoaXMuX2Fzc2V0SW5mb1NlcnZpY2UgPSBuZXcgQXNzZXRJbmZvU2VydmljZSh0aGlzLl9wcm90b2NvbCwgdGhpcy5kb21haW4pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy9jYW4ndCB1c2UgJ2NvbnRlbnQudXBseW5rLmNvbScgYXMgYSBkb21haW4gbmFtZSBiZWNhdXNlIHNlc3Npb24gZGF0YSBsaXZlc1xuICAgICAgICAvLyBpbnNpZGUgYSBzcGVjaWZpYyBkb21haW5cbiAgICAgICAgaWYgKHRoaXMuX2RvbWFpbiAhPT0gJ2NvbnRlbnQudXBseW5rLmNvbScpIHtcbiAgICAgICAgICAgIHRoaXMuX3BpbmdTZXJ2aWNlID0gbmV3IFBpbmdTZXJ2aWNlKHRoaXMuX3Byb3RvY29sLCB0aGlzLmRvbWFpbiwgdGhpcy5fc2Vzc2lvbklkLCB0aGlzLl92aWRlbyk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl91cmwgPSB1cmw7XG4gICAgICAgIHRoaXMuX3ZpZGVvLnNyYyA9IHVybDtcbiAgICB9XG5cbiAgICBwdWJsaWMgbG9hZChpbmZvOiBzdHJpbmcgfCBMb2FkQ29uZmlnKTogdm9pZCB7XG4gICAgICAgIGxldCB1cmw6IHN0cmluZyA9IG51bGw7XG4gICAgICAgIGxldCBmYWlycGxheUNlcnRQYXRoOiBzdHJpbmcgPSBudWxsO1xuXG4gICAgICAgIGlmICh0eXBlb2YgaW5mbyA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgdXJsID0gaW5mbyBhcyBzdHJpbmc7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB1cmwgPSAoaW5mbyBhcyBMb2FkQ29uZmlnKS51cmw7XG4gICAgICAgICAgICBpZiAoKGluZm8gYXMgTG9hZENvbmZpZykuZmFpcnBsYXlDZXJ0aWZpY2F0ZVBhdGggIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIGZhaXJwbGF5Q2VydFBhdGggPSAoaW5mbyBhcyBMb2FkQ29uZmlnKS5mYWlycGxheUNlcnRpZmljYXRlUGF0aDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMucHJlcGFyZUxvYWQodXJsKTtcblxuICAgICAgICBpZiAoZmFpcnBsYXlDZXJ0UGF0aCkge1xuICAgICAgICAgICAgLy8gTG9hZCBGYWlycGxheVxuICAgICAgICAgICAgY29uc29sZS5sb2coXCJMb2FkaW5nIHdpdGggRmFpcnBsYXlcIik7XG4gICAgICAgICAgICB0aGlzLl9saWNlbnNlTWFuYWdlckZQLmxvYWQoZmFpcnBsYXlDZXJ0UGF0aCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLl92aWRlby5sb2FkKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgZGVzdHJveSgpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5fdmlkZW8uc3JjID0gbnVsbDtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vdmVycmlkZUN1cnJlbnRUaW1lKCk6IHZvaWQge1xuICAgICAgICAvL292ZXJyaWRlICdjdXJyZW50VGltZScgcHJvcGVydHkgc28gd2UgY2FuIHByZXZlbnRcbiAgICAgICAgLy8gdXNlcnMgZnJvbSBzZXR0aW5nIHZpZGVvLmN1cnJlbnRUaW1lLCBhbGxvd2luZyB0aGVtXG4gICAgICAgIC8vIHRvIHNraXAgYWRzLlxuICAgICAgICBjb25zdCBjdXJyZW50VGltZURlc2NyaXB0b3IgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKEhUTUxNZWRpYUVsZW1lbnQucHJvdG90eXBlLCAnY3VycmVudFRpbWUnKTtcbiAgICAgICAgaWYgKGN1cnJlbnRUaW1lRGVzY3JpcHRvcikge1xuICAgICAgICAgICAgY29uc3QgZ2V0Q3VycmVudFRpbWUgPSBjdXJyZW50VGltZURlc2NyaXB0b3IuZ2V0O1xuICAgICAgICAgICAgY29uc3Qgc2V0Q3VycmVudFRpbWUgPSBjdXJyZW50VGltZURlc2NyaXB0b3Iuc2V0O1xuXG4gICAgICAgICAgICBsZXQgc2VsZiA9IHRoaXM7XG5cbiAgICAgICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0aGlzLl92aWRlbywgJ2N1cnJlbnRUaW1lJywge1xuICAgICAgICAgICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZ2V0Q3VycmVudFRpbWUuYXBwbHkodGhpcyk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBzZXQ6IGZ1bmN0aW9uICh2YWwpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHNlbGYuY2FuU2VlaygpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZXRDdXJyZW50VGltZS5hcHBseSh0aGlzLCBbdmFsXSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIGVudW1lcmFibGU6IGZhbHNlLFxuICAgICAgICAgICAgICAgIGNvbmZpZ3VyYWJsZTogZmFsc2UsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIERldGVybWluZXMgaWYgdGhlIHBsYXllciBjYW4gc2VlayBnaXZlbiBpdCdzIGN1cnJlbnQgcG9zaXRpb24gYW5kXG4gICAgICogd2V0aGVyIG9yIG5vdCBpdCdzIGluIGFuIGFkIGJyZWFrLlxuICAgICAqIEByZXR1cm4ge2Jvb2xlYW59IFRydWUgaWYgdGhlIHBsYXllciBjYW4gc2Vlaywgb3RoZXJ3aXNlIGZhbHNlLlxuICAgICAqL1xuICAgIGNhblNlZWsoKTogYm9vbGVhbiB7XG4gICAgICAgIGlmICghdGhpcy5fY29uZmlnLmRpc2FibGVTZWVrRHVyaW5nQWRCcmVhaykge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gIXRoaXMuX2luQWRCcmVhaztcbiAgICB9XG5cbiAgICBwcml2YXRlIF9nZXRTZXNzaW9uSWQodXJsOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgICAgICAvL2h0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9hLzUxNTgzMDFcbiAgICAgICAgdmFyIG1hdGNoID0gUmVnRXhwKCdbPyZdcGJzPShbXiZdKiknKS5leGVjKHVybCk7XG4gICAgICAgIHJldHVybiBtYXRjaCAmJiBkZWNvZGVVUklDb21wb25lbnQobWF0Y2hbMV0ucmVwbGFjZSgvXFwrL2csICcgJykpO1xuICAgIH1cblxuICAgIHByaXZhdGUgX2dldERvbWFpbih1cmw6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgICAgIHZhciBsaW5rID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpO1xuICAgICAgICBsaW5rLnNldEF0dHJpYnV0ZSgnaHJlZicsIHVybCk7XG5cbiAgICAgICAgcmV0dXJuIGxpbmsuaG9zdG5hbWU7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfaXNVcGx5bmtVcmwodXJsOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICAgICAgY29uc3QgdGVtcCA9IHVybC50b0xvd2VyQ2FzZSgpO1xuICAgICAgICByZXR1cm4gdGVtcC5pbmRleE9mKCd1cGx5bmsuY29tJykgPiAtMSB8fCB0ZW1wLmluZGV4T2YoJ2Rvd25seW5rLmNvbScpID4gLTE7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25EdXJhdGlvbkNoYW5nZSgpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuX3ZpZGVvLmR1cmF0aW9uID09PSBJbmZpbml0eSkge1xuICAgICAgICAgICAgdGhpcy5fcGxheWxpc3RUeXBlID0gJ0xJVkUnO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5fcGxheWxpc3RUeXBlID0gJ1ZPRCc7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXRoaXMuX2ZpcmVkUmVhZHlFdmVudCkge1xuICAgICAgICAgICAgdGhpcy5fZmlyZWRSZWFkeUV2ZW50ID0gdHJ1ZTtcbiAgICAgICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLlJlYWR5KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHN0YXRpYyBnZXQgRXZlbnQoKSB7XG4gICAgICAgIHJldHVybiBFdmVudHM7XG4gICAgfVxuXG4gICAgcHVibGljIHNldEJyb3dzZXIoc2FmYXJpOiBib29sZWFuLCBpZTogYm9vbGVhbiwgY2hyb21lOiBib29sZWFuLCBmaXJlZm94OiBib29sZWFuKSB7XG4gICAgICAgIC8vZG8gbm90aGluZ1xuICAgIH1cblxuICAgIHB1YmxpYyBnZXRUaHVtYm5haWwodGltZTogbnVtYmVyLCBzaXplOiBcInNtYWxsXCIgfCBcImxhcmdlXCIpOiB0aHVtYi5UaHVtYm5haWwge1xuICAgICAgICAvL2RvIG5vdGhpbmdcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgZ2V0IGF1ZGlvVHJhY2tzKCk6IEF1ZGlvVHJhY2tMaXN0IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3ZpZGVvLmF1ZGlvVHJhY2tzO1xuICAgIH1cblxuICAgIGdldCBhdWRpb1RyYWNrSWQoKTogbnVtYmVyIHtcbiAgICAgICAgbGV0IGN1cnJlbnRUcmFjayA9IHRoaXMuYXVkaW9UcmFjaztcbiAgICAgICAgaWYgKGN1cnJlbnRUcmFjayAhPSBudWxsKSB7XG4gICAgICAgICAgICByZXR1cm4gcGFyc2VJbnQoY3VycmVudFRyYWNrLmlkKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gMDtcblxuICAgIH1cblxuICAgIHNldCBhdWRpb1RyYWNrSWQoaWQ6IG51bWJlcikge1xuICAgICAgICBsZXQgYXVkaW9UcmFja3MgPSB0aGlzLmF1ZGlvVHJhY2tzO1xuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYXVkaW9UcmFja3MubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGlmIChwYXJzZUludChhdWRpb1RyYWNrc1tpXS5pZCkgPT09IGlkKSB7XG4gICAgICAgICAgICAgICAgYXVkaW9UcmFja3NbaV0uZW5hYmxlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0IGF1ZGlvVHJhY2soKTogQXVkaW9UcmFjayB7XG4gICAgICAgIGxldCBhdWRpb1RyYWNrcyA9IHRoaXMuYXVkaW9UcmFja3M7XG5cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhdWRpb1RyYWNrcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgaWYgKGF1ZGlvVHJhY2tzW2ldLmVuYWJsZWQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gYXVkaW9UcmFja3NbaV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBnZXQgZG9tYWluKCk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiB0aGlzLl9kb21haW47XG4gICAgfVxuXG4gICAgZ2V0IHNlc3Npb25JZCgpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdGhpcy5fc2Vzc2lvbklkO1xuICAgIH1cblxuICAgIGdldCBwbGF5bGlzdFR5cGUoKTogXCJWT0RcIiB8IFwiRVZFTlRcIiB8IFwiTElWRVwiIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3BsYXlsaXN0VHlwZTtcbiAgICB9XG5cbiAgICBnZXQgZHVyYXRpb24oKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3ZpZGVvLmR1cmF0aW9uO1xuICAgIH1cblxuICAgIGdldCBzdXBwb3J0c1RodW1ibmFpbHMoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBnZXQgY2xhc3NOYW1lKCk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiAnTmF0aXZlUGxheWVyJztcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vbklEM1RhZyhldmVudDogSUQzVGFnRXZlbnQpOiB2b2lkIHtcbiAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuSUQzVGFnLCBldmVudCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25UeHh4SUQzRnJhbWUoZXZlbnQ6IFR4eHhJRDNGcmFtZUV2ZW50KTogdm9pZCB7XG4gICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLlR4eHhJRDNGcmFtZSwgZXZlbnQpO1xuICAgIH1cblxuICAgIHByaXZhdGUgX29uUHJpdklEM0ZyYW1lKGV2ZW50OiBQcml2SUQzRnJhbWVFdmVudCk6IHZvaWQge1xuICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5Qcml2SUQzRnJhbWUsIGV2ZW50KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vblRleHRJRDNGcmFtZShldmVudDogVGV4dElEM0ZyYW1lRXZlbnQpOiB2b2lkIHtcbiAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuVGV4dElEM0ZyYW1lLCBldmVudCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25BdWRpb1RyYWNrQWRkZWQoZXZlbnQ6IFRyYWNrRXZlbnQpOiB2b2lkIHtcbiAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuQXVkaW9UcmFja0FkZGVkLCBldmVudCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25TbGljZUVudGVyZWQoZXZlbnQ6IFNsaWNlRXZlbnQpOiB2b2lkIHtcbiAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuU2xpY2VFbnRlcmVkLCBldmVudCk7XG5cbiAgICAgICAgaWYgKCF0aGlzLl9hc3NldEluZm9TZXJ2aWNlKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5fY3VycmVudEFzc2V0SWQgPT09IG51bGwpIHtcbiAgICAgICAgICAgIC8vZmlyc3QgYXNzZXQgaWQgZW5jb3VudGVyZWRcbiAgICAgICAgICAgIHRoaXMuX2Fzc2V0SW5mb1NlcnZpY2UubG9hZEFzc2V0SWQoZXZlbnQuYXNzZXRJZCwgbnVsbCwgKGFzc2V0SW5mbzogQXNzZXRJbmZvKSA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy5fY3VycmVudEFzc2V0SWQgPSBldmVudC5hc3NldElkO1xuICAgICAgICAgICAgICAgIHRoaXMuX29uQXNzZXRFbmNvdW50ZXJlZChldmVudC5jdWUsIGFzc2V0SW5mbyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLl9jdXJyZW50QXNzZXRJZCAhPT0gZXZlbnQuYXNzZXRJZCkge1xuICAgICAgICAgICAgdGhpcy5fYXNzZXRJbmZvU2VydmljZS5sb2FkQXNzZXRJZCh0aGlzLl9jdXJyZW50QXNzZXRJZCwgbnVsbCwgKGN1cnJlbnRBc3NldEluZm86IEFzc2V0SW5mbykgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuX2Fzc2V0SW5mb1NlcnZpY2UubG9hZEFzc2V0SWQoZXZlbnQuYXNzZXRJZCwgbnVsbCwgKG5ld0Fzc2V0SW5mbzogQXNzZXRJbmZvKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2N1cnJlbnRBc3NldElkID0gZXZlbnQuYXNzZXRJZDtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fb25OZXdBc3NldEVuY291bnRlcmVkKGV2ZW50LmN1ZSwgY3VycmVudEFzc2V0SW5mbywgbmV3QXNzZXRJbmZvKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy9zYW1lIGFzc2V0IGlkIGFzIHByZXZpb3VzIG9uZSwgZG8gbm90aGluZ1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25Bc3NldEVuY291bnRlcmVkKGN1ZTogVGV4dFRyYWNrQ3VlLCBhc3NldEluZm86IEFzc2V0SW5mbyk6IHZvaWQge1xuICAgICAgICBsZXQgc2VnbWVudDogU2VnbWVudCA9IHVuZGVmaW5lZDtcblxuICAgICAgICBpZiAoYXNzZXRJbmZvLmlzQWQpIHtcbiAgICAgICAgICAgIHNlZ21lbnQgPSB7XG4gICAgICAgICAgICAgICAgaWQ6IGFzc2V0SW5mby5hc3NldCxcbiAgICAgICAgICAgICAgICBpbmRleDogMCxcbiAgICAgICAgICAgICAgICBzdGFydFRpbWU6IGN1ZS5zdGFydFRpbWUsXG4gICAgICAgICAgICAgICAgZW5kVGltZTogY3VlLnN0YXJ0VGltZSArIGFzc2V0SW5mby5kdXJhdGlvbixcbiAgICAgICAgICAgICAgICB0eXBlOiAnQUQnXG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBsZXQgc2VnbWVudHM6IFNlZ21lbnRbXSA9IFtzZWdtZW50XTtcbiAgICAgICAgICAgIHRoaXMuX2N1cnJlbnRBZEJyZWFrID0gbmV3IEFkQnJlYWsoc2VnbWVudHMpO1xuICAgICAgICAgICAgdGhpcy5faW5BZEJyZWFrID0gdHJ1ZTtcblxuICAgICAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuQXNzZXRFbnRlcmVkLCB7IHNlZ21lbnQ6IHNlZ21lbnQsIGFzc2V0OiBhc3NldEluZm8gfSk7XG4gICAgICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5BZEJyZWFrRW50ZXJlZCwgeyBhZEJyZWFrOiB0aGlzLl9jdXJyZW50QWRCcmVhayB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuX2luQWRCcmVhayA9IGZhbHNlO1xuXG4gICAgICAgICAgICAvL2Rvbid0IGhhdmUgYSBzZWdtZW50IHRvIHBhc3MgYWxvbmcgYmVjYXVzZSB3ZSBkb24ndCBrbm93IHRoZSBkdXJhdGlvbiBvZiB0aGlzIGFzc2V0XG4gICAgICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5Bc3NldEVudGVyZWQsIHsgc2VnbWVudDogdW5kZWZpbmVkLCBhc3NldDogYXNzZXRJbmZvIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25OZXdBc3NldEVuY291bnRlcmVkKGN1ZTogVGV4dFRyYWNrQ3VlLCBwcmV2aW91c0Fzc2V0OiBBc3NldEluZm8sIG5ld0Fzc2V0OiBBc3NldEluZm8pOiB2b2lkIHtcbiAgICAgICAgLy93aWxsIHdlIHN0aWxsIGJlIGluIGFuIGFkIGJyZWFrIGFmdGVyIHRoaXMgYXNzZXQ/XG4gICAgICAgIHRoaXMuX2luQWRCcmVhayA9IG5ld0Fzc2V0LmlzQWQ7XG5cbiAgICAgICAgaWYgKHByZXZpb3VzQXNzZXQuaXNBZCAmJiB0aGlzLl9jdXJyZW50QWRCcmVhaykge1xuICAgICAgICAgICAgLy9sZWF2aW5nIGFkIGJyZWFrXG4gICAgICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5Bc3NldEV4aXRlZCwgeyBzZWdtZW50OiB0aGlzLl9jdXJyZW50QWRCcmVhay5nZXRTZWdtZW50QXQoMCksIGFzc2V0OiBwcmV2aW91c0Fzc2V0IH0pO1xuICAgICAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuQWRCcmVha0V4aXRlZCwgeyBhZEJyZWFrOiB0aGlzLl9jdXJyZW50QWRCcmVhayB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vZG9uJ3QgaGF2ZSBhIHNlZ21lbnQgdG8gcGFzcyBhbG9uZyBiZWNhdXNlIHdlIGRvbid0IGtub3cgdGhlIGR1cmF0aW9uIG9mIHRoaXMgYXNzZXRcbiAgICAgICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLkFzc2V0RXhpdGVkLCB7IHNlZ21lbnQ6IHVuZGVmaW5lZCwgYXNzZXQ6IHByZXZpb3VzQXNzZXQgfSk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9vbkFzc2V0RW5jb3VudGVyZWQoY3VlLCBuZXdBc3NldCk7XG4gICAgfVxuXG4gICAgcHVibGljIG9uVGV4dFRyYWNrQ2hhbmdlZChjaGFuZ2VUcmFja0V2ZW50OiBUcmFja0V2ZW50KTogdm9pZCB7XG4gICAgICAgIC8vZG8gbm90aGluZ1xuICAgIH1cblxuICAgIGdldCB2ZXJzaW9uKCk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiAnMDIuMDAuMTgwMjA3MDEnOyAvL3dpbGwgYmUgbW9kaWZpZWQgYnkgdGhlIGJ1aWxkIHNjcmlwdFxuICAgIH1cbn1cbiIsIlxuLy9wb2x5ZmlsbCBBcnJheS5maW5kKClcbi8vaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvSmF2YVNjcmlwdC9SZWZlcmVuY2UvR2xvYmFsX09iamVjdHMvQXJyYXkvZmluZFxuLy8gaHR0cHM6Ly90YzM5LmdpdGh1Yi5pby9lY21hMjYyLyNzZWMtYXJyYXkucHJvdG90eXBlLmZpbmRcbmlmICghQXJyYXkucHJvdG90eXBlLmZpbmQpIHtcbiAgT2JqZWN0LmRlZmluZVByb3BlcnR5KEFycmF5LnByb3RvdHlwZSwgJ2ZpbmQnLCB7XG4gICAgdmFsdWU6IGZ1bmN0aW9uKHByZWRpY2F0ZTphbnkpIHtcbiAgICAgLy8gMS4gTGV0IE8gYmUgPyBUb09iamVjdCh0aGlzIHZhbHVlKS5cbiAgICAgIGlmICh0aGlzID09IG51bGwpIHtcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignXCJ0aGlzXCIgaXMgbnVsbCBvciBub3QgZGVmaW5lZCcpO1xuICAgICAgfVxuXG4gICAgICB2YXIgbyA9IE9iamVjdCh0aGlzKTtcblxuICAgICAgLy8gMi4gTGV0IGxlbiBiZSA/IFRvTGVuZ3RoKD8gR2V0KE8sIFwibGVuZ3RoXCIpKS5cbiAgICAgIHZhciBsZW4gPSBvLmxlbmd0aCA+Pj4gMDtcblxuICAgICAgLy8gMy4gSWYgSXNDYWxsYWJsZShwcmVkaWNhdGUpIGlzIGZhbHNlLCB0aHJvdyBhIFR5cGVFcnJvciBleGNlcHRpb24uXG4gICAgICBpZiAodHlwZW9mIHByZWRpY2F0ZSAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdwcmVkaWNhdGUgbXVzdCBiZSBhIGZ1bmN0aW9uJyk7XG4gICAgICB9XG5cbiAgICAgIC8vIDQuIElmIHRoaXNBcmcgd2FzIHN1cHBsaWVkLCBsZXQgVCBiZSB0aGlzQXJnOyBlbHNlIGxldCBUIGJlIHVuZGVmaW5lZC5cbiAgICAgIHZhciB0aGlzQXJnID0gYXJndW1lbnRzWzFdO1xuXG4gICAgICAvLyA1LiBMZXQgayBiZSAwLlxuICAgICAgdmFyIGsgPSAwO1xuXG4gICAgICAvLyA2LiBSZXBlYXQsIHdoaWxlIGsgPCBsZW5cbiAgICAgIHdoaWxlIChrIDwgbGVuKSB7XG4gICAgICAgIC8vIGEuIExldCBQayBiZSAhIFRvU3RyaW5nKGspLlxuICAgICAgICAvLyBiLiBMZXQga1ZhbHVlIGJlID8gR2V0KE8sIFBrKS5cbiAgICAgICAgLy8gYy4gTGV0IHRlc3RSZXN1bHQgYmUgVG9Cb29sZWFuKD8gQ2FsbChwcmVkaWNhdGUsIFQsIMKrIGtWYWx1ZSwgaywgTyDCuykpLlxuICAgICAgICAvLyBkLiBJZiB0ZXN0UmVzdWx0IGlzIHRydWUsIHJldHVybiBrVmFsdWUuXG4gICAgICAgIHZhciBrVmFsdWUgPSBvW2tdO1xuICAgICAgICBpZiAocHJlZGljYXRlLmNhbGwodGhpc0FyZywga1ZhbHVlLCBrLCBvKSkge1xuICAgICAgICAgIHJldHVybiBrVmFsdWU7XG4gICAgICAgIH1cbiAgICAgICAgLy8gZS4gSW5jcmVhc2UgayBieSAxLlxuICAgICAgICBrKys7XG4gICAgICB9XG5cbiAgICAgIC8vIDcuIFJldHVybiB1bmRlZmluZWQuXG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgfSk7XG59IiwiXG4vL3BvbHlmaWxsIGZvciBPYmplY3QuYXNzaWduKCkgZm9yIElFMTFcbi8vaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvSmF2YVNjcmlwdC9SZWZlcmVuY2UvR2xvYmFsX09iamVjdHMvT2JqZWN0L2Fzc2lnblxuaWYgKHR5cGVvZiBPYmplY3QuYXNzaWduICE9ICdmdW5jdGlvbicpIHtcbiAgKGZ1bmN0aW9uICgpIHtcbiAgICBPYmplY3QuYXNzaWduID0gZnVuY3Rpb24gKHRhcmdldDogYW55KSB7XG4gICAgICAndXNlIHN0cmljdCc7XG4gICAgICAvLyBXZSBtdXN0IGNoZWNrIGFnYWluc3QgdGhlc2Ugc3BlY2lmaWMgY2FzZXMuXG4gICAgICBpZiAodGFyZ2V0ID09PSB1bmRlZmluZWQgfHwgdGFyZ2V0ID09PSBudWxsKSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0Nhbm5vdCBjb252ZXJ0IHVuZGVmaW5lZCBvciBudWxsIHRvIG9iamVjdCcpO1xuICAgICAgfVxuXG4gICAgICB2YXIgb3V0cHV0ID0gT2JqZWN0KHRhcmdldCk7XG4gICAgICBmb3IgKHZhciBpbmRleCA9IDE7IGluZGV4IDwgYXJndW1lbnRzLmxlbmd0aDsgaW5kZXgrKykge1xuICAgICAgICB2YXIgc291cmNlID0gYXJndW1lbnRzW2luZGV4XTtcbiAgICAgICAgaWYgKHNvdXJjZSAhPT0gdW5kZWZpbmVkICYmIHNvdXJjZSAhPT0gbnVsbCkge1xuICAgICAgICAgIGZvciAodmFyIG5leHRLZXkgaW4gc291cmNlKSB7XG4gICAgICAgICAgICBpZiAoc291cmNlLmhhc093blByb3BlcnR5KG5leHRLZXkpKSB7XG4gICAgICAgICAgICAgIG91dHB1dFtuZXh0S2V5XSA9IHNvdXJjZVtuZXh0S2V5XTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBvdXRwdXQ7XG4gICAgfTtcbiAgfSkoKTtcbn0iLCJcbi8vcG9seWZpbGwgZm9yIFZUVEN1ZSBmb3IgTVMgRWRnZSBhbmQgSUUxMVxuKGZ1bmN0aW9uICgpIHtcbiAgICAoPGFueT53aW5kb3cpLlZUVEN1ZSA9ICg8YW55PndpbmRvdykuVlRUQ3VlIHx8ICg8YW55PndpbmRvdykuVGV4dFRyYWNrQ3VlO1xufSkoKTtcbiIsImltcG9ydCAnLi9wb2x5ZmlsbC92dHQtY3VlJztcbmltcG9ydCAnLi9wb2x5ZmlsbC9vYmplY3QnO1xuaW1wb3J0ICcuL3BvbHlmaWxsL2FycmF5JztcbmltcG9ydCB7IFBsYXllciB9IGZyb20gJy4vcGxheWVyJztcbmltcG9ydCB7IEFkYXB0aXZlUGxheWVyIH0gZnJvbSAnLi9hZGFwdGl2ZS1wbGF5ZXInO1xuaW1wb3J0IHsgTmF0aXZlUGxheWVyIH0gZnJvbSAnLi9uYXRpdmUtcGxheWVyJztcblxuXG5mdW5jdGlvbiBpc05hdGl2ZVBsYXliYWNrU3VwcG9ydGVkKCk6IGJvb2xlYW4ge1xuICAgIHRyeSB7XG4gICAgICAgIGxldCB2aWRlbyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3ZpZGVvJyk7XG5cbiAgICAgICAgaWYgKHZpZGVvLmNhblBsYXlUeXBlKSB7XG4gICAgICAgICAgICByZXR1cm4gdmlkZW8uY2FuUGxheVR5cGUoJ2FwcGxpY2F0aW9uL3ZuZC5hcHBsZS5tcGVndXJsJykgIT09ICcnO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgcmV0dXJuIGZhbHNlO1xufVxuXG5mdW5jdGlvbiBpc0h0bWxQbGF5YmFja1N1cHBvcnRlZCgpOiBib29sZWFuIHtcbiAgICBpZiAoJ01lZGlhU291cmNlJyBpbiB3aW5kb3cgJiYgTWVkaWFTb3VyY2UuaXNUeXBlU3VwcG9ydGVkKSB7XG4gICAgICAgIHJldHVybiBNZWRpYVNvdXJjZS5pc1R5cGVTdXBwb3J0ZWQoJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40MkUwMUUsbXA0YS40MC4yXCInKTtcbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIGN1cnJlbnRTY3JpcHQoKSB7XG4gICAgLy9oYWNreSwgYnV0IHdvcmtzIGZvciBvdXIgbmVlZHNcbiAgICBjb25zdCBzY3JpcHRzID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ3NjcmlwdCcpO1xuICAgIGlmIChzY3JpcHRzICYmIHNjcmlwdHMubGVuZ3RoKSB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc2NyaXB0cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgaWYgKHNjcmlwdHNbaV0uc3JjLmluZGV4T2YoJ3VwbHluay1jb3JlLmpzJykgPiAtMSB8fCBzY3JpcHRzW2ldLnNyYy5pbmRleE9mKCd1cGx5bmstY29yZS5taW4uanMnKSA+IC0xKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNjcmlwdHNbaV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gdW5kZWZpbmVkO1xufVxuXG52YXIgbG9hZGVkVXBseW5rQWRhcHRpdmUgPSB0cnVlO1xuXG5mdW5jdGlvbiBsb2FkVXBseW5rQWRhcHRpdmVQbGF5ZXIodmlkZW86IEhUTUxWaWRlb0VsZW1lbnQsIG9wdGlvbnM/OiBQbGF5ZXJPcHRpb25zLCBjYWxsYmFjaz86IChwbGF5ZXI6IFBsYXllcikgPT4gdm9pZCkge1xuXG4gICAgLy9sb2FkIHVwbHluay1hZGFwdGl2ZS5qc1xuICAgIGxldCB1cmwgPSBjdXJyZW50U2NyaXB0KCkuc3JjLnN1YnN0cmluZygwLCBjdXJyZW50U2NyaXB0KCkuc3JjLmxhc3RJbmRleE9mKCcvJykgKyAxKSArICd1cGx5bmstYWRhcHRpdmUuanMnO1xuXG4gICAgLy8gaWYgdXNpbmcgV2ViQXNzZW1ibHksIHRoZSB3YXNtIGlzIGFscmVhZHkgbG9hZGVkIGZyb20gdGhlIGh0bWxcbiAgICBsZXQgZW5hYmxlV0FTTSA9IGZhbHNlO1xuICAgIGlmIChlbmFibGVXQVNNICYmIHR5cGVvZiBXZWJBc3NlbWJseSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgY2FsbGJhY2sobmV3IEFkYXB0aXZlUGxheWVyKHZpZGVvLCBvcHRpb25zKSk7XG4gICAgfVxuICAgIGVsc2UgaWYgKCFpc1NjcmlwdEFscmVhZHlJbmNsdWRlZCh1cmwpKSB7XG4gICAgICAgIGxvYWRlZFVwbHlua0FkYXB0aXZlID0gZmFsc2U7XG4gICAgICAgIGxvYWRTY3JpcHRBc3luYyh1cmwsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGxvYWRlZFVwbHlua0FkYXB0aXZlID0gdHJ1ZTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG5ldyBBZGFwdGl2ZVBsYXllcih2aWRlbywgb3B0aW9ucykpO1xuICAgICAgICB9KTtcbiAgICB9IGVsc2UgaWYgKGxvYWRlZFVwbHlua0FkYXB0aXZlKSB7XG4gICAgICAgIGNhbGxiYWNrKG5ldyBBZGFwdGl2ZVBsYXllcih2aWRlbywgb3B0aW9ucykpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIC8vc2NyaXB0IGlzIGxvYWRpbmcgc28gd2UnbGwga2VlcCBjaGVja2luZyBpdCdzXG4gICAgICAgIC8vIHN0YXR1cyBiZWZvcmUgZmlyaW5nIHRoZSBjYWxsYmFja1xuICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGxvYWRVcGx5bmtBZGFwdGl2ZVBsYXllcih2aWRlbywgb3B0aW9ucywgY2FsbGJhY2spO1xuICAgICAgICB9LCA1MDApO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gbG9hZFNjcmlwdEFzeW5jKHVybDogc3RyaW5nLCBjYWxsYmFjazogKCkgPT4gdm9pZCk6IHZvaWQge1xuICAgIGxldCBoZWFkID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ2hlYWQnKVswXTtcbiAgICBsZXQgc2NyaXB0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc2NyaXB0Jyk7XG5cbiAgICBzY3JpcHQudHlwZSA9ICd0ZXh0L2phdmFzY3JpcHQnO1xuICAgIHNjcmlwdC5zcmMgPSB1cmw7XG5cbiAgICBzY3JpcHQub25sb2FkID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBjYWxsYmFjaygpO1xuICAgIH07XG5cbiAgICBoZWFkLmFwcGVuZENoaWxkKHNjcmlwdCk7XG59XG5cbmZ1bmN0aW9uIGlzU2NyaXB0QWxyZWFkeUluY2x1ZGVkKHVybDogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgdmFyIHNjcmlwdHMgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZShcInNjcmlwdFwiKTtcbiAgICBpZiAoc2NyaXB0cyAmJiBzY3JpcHRzLmxlbmd0aCkge1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHNjcmlwdHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGlmIChzY3JpcHRzW2ldLnNyYyA9PT0gdXJsKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUFkYXB0aXZlUGxheWVyKHZpZGVvOiBIVE1MVmlkZW9FbGVtZW50LCBvcHRpb25zOiBhbnksIGNhbGxiYWNrPzogKHBsYXllcjogUGxheWVyKSA9PiB2b2lkKSB7XG5cbiAgICBpZiAob3B0aW9ucy5wcmVmZXJOYXRpdmVQbGF5YmFjaykge1xuICAgICAgICBpZiAoaXNOYXRpdmVQbGF5YmFja1N1cHBvcnRlZCgpKSB7XG4gICAgICAgICAgICAvL2NvbnNvbGUubG9nKFwidXNpbmcgbmF0aXZlIHBsYXliYWNrXCIpO1xuICAgICAgICAgICAgY2FsbGJhY2sobmV3IE5hdGl2ZVBsYXllcih2aWRlbywgb3B0aW9ucykpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9IGVsc2UgaWYgKGlzSHRtbFBsYXliYWNrU3VwcG9ydGVkKCkpIHtcbiAgICAgICAgICAgIC8vY29uc29sZS5sb2coXCJmYWxsaW5nIGJhY2sgdG8gdXBseW5rIHBsYXllclwiKTtcbiAgICAgICAgICAgIGxvYWRVcGx5bmtBZGFwdGl2ZVBsYXllcih2aWRlbywgb3B0aW9ucywgY2FsbGJhY2spO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKGlzSHRtbFBsYXliYWNrU3VwcG9ydGVkKCkpIHtcbiAgICAgICAgICAgIC8vY29uc29sZS5sb2coXCJ1c2luZyB1cGx5bmsgcGxheWVyXCIpO1xuICAgICAgICAgICAgbG9hZFVwbHlua0FkYXB0aXZlUGxheWVyKHZpZGVvLCBvcHRpb25zLCBjYWxsYmFjayk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gZWxzZSBpZiAoaXNOYXRpdmVQbGF5YmFja1N1cHBvcnRlZCgpKSB7XG4gICAgICAgICAgICAvL2NvbnNvbGUubG9nKFwiZmFsbGluZyBiYWNrIHRvIG5hdGl2ZSBwbGF5YmFja1wiKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG5ldyBOYXRpdmVQbGF5ZXIodmlkZW8sIG9wdGlvbnMpKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgIH1cbiAgICBjb25zb2xlLndhcm4oXCJubyBwbGF5YmFjayBtb2RlIHN1cHBvcnRlZFwiKTtcbiAgICBjYWxsYmFjayh1bmRlZmluZWQpO1xufVxuXG4oPGFueT53aW5kb3cpLmNyZWF0ZUFkYXB0aXZlUGxheWVyID0gY3JlYXRlQWRhcHRpdmVQbGF5ZXI7XG4oPGFueT53aW5kb3cpLkFkYXB0aXZlUGxheWVyID0gQWRhcHRpdmVQbGF5ZXI7IiwiaW1wb3J0IHsgU3RyaW5nTWFwIH0gZnJvbSAnLi9zdHJpbmctbWFwJztcblxuLy9odHRwOi8vd3d3LmRhdGNobGV5Lm5hbWUvZXM2LWV2ZW50ZW1pdHRlci9cbi8vaHR0cHM6Ly9naXN0LmdpdGh1Yi5jb20vZGF0Y2hsZXkvMzczNTNkNmEyY2I2Mjk2ODdlYjlcbi8vaHR0cDovL2NvZGVwZW4uaW8veXVrdWxlbGUvcGVuL3lOVlZ4Vi8/ZWRpdG9ycz0wMDFcbmV4cG9ydCBjbGFzcyBPYnNlcnZhYmxlIHtcbiAgICBwcml2YXRlIF9saXN0ZW5lcnM6IFN0cmluZ01hcDxhbnk+O1xuXG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHRoaXMuX2xpc3RlbmVycyA9IG5ldyBTdHJpbmdNYXAoKTtcbiAgICB9XG5cbiAgICBvbihsYWJlbDogc3RyaW5nLCBjYWxsYmFjazogYW55KSB7XG4gICAgICAgIHRoaXMuX2xpc3RlbmVycy5oYXMobGFiZWwpIHx8IHRoaXMuX2xpc3RlbmVycy5zZXQobGFiZWwsIFtdKTtcbiAgICAgICAgdGhpcy5fbGlzdGVuZXJzLmdldChsYWJlbCkucHVzaChjYWxsYmFjayk7XG4gICAgfVxuXG4gICAgb2ZmKGxhYmVsOiBzdHJpbmcsIGNhbGxiYWNrOiBhbnkpIHtcbiAgICAgICAgbGV0IGxpc3RlbmVycyA9IHRoaXMuX2xpc3RlbmVycy5nZXQobGFiZWwpO1xuICAgICAgICBsZXQgaW5kZXg6IG51bWJlcjtcblxuICAgICAgICBpZiAobGlzdGVuZXJzICYmIGxpc3RlbmVycy5sZW5ndGgpIHtcbiAgICAgICAgICAgIGluZGV4ID0gbGlzdGVuZXJzLnJlZHVjZSgoaTogbnVtYmVyLCBsaXN0ZW5lcjogYW55LCBpbmRleDogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuICh0aGlzLl9pc0Z1bmN0aW9uKGxpc3RlbmVyKSAmJiBsaXN0ZW5lciA9PT0gY2FsbGJhY2spID8gaSA9IGluZGV4IDogaTtcbiAgICAgICAgICAgIH0sIC0xKTtcblxuICAgICAgICAgICAgaWYgKGluZGV4ID4gLTEpIHtcbiAgICAgICAgICAgICAgICBsaXN0ZW5lcnMuc3BsaWNlKGluZGV4LCAxKTtcbiAgICAgICAgICAgICAgICB0aGlzLl9saXN0ZW5lcnMuc2V0KGxhYmVsLCBsaXN0ZW5lcnMpO1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBmaXJlKGxhYmVsOiBzdHJpbmcsIC4uLmFyZ3M6IGFueVtdKSB7XG4gICAgICAgIGxldCBsaXN0ZW5lcnMgPSB0aGlzLl9saXN0ZW5lcnMuZ2V0KGxhYmVsKTtcblxuICAgICAgICBpZiAobGlzdGVuZXJzICYmIGxpc3RlbmVycy5sZW5ndGgpIHtcbiAgICAgICAgICAgIGxpc3RlbmVycy5mb3JFYWNoKChsaXN0ZW5lcjogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgbGlzdGVuZXIoLi4uYXJncyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9pc0Z1bmN0aW9uKG9iajogYW55KSB7XG4gICAgICAgIHJldHVybiB0eXBlb2Ygb2JqID09ICdmdW5jdGlvbicgfHwgZmFsc2U7XG4gICAgfVxufSIsImltcG9ydCB7IEFkQnJlYWsgfSBmcm9tICcuLi9hZC9hZC1icmVhayc7XG5cbmV4cG9ydCBjbGFzcyBTZWdtZW50TWFwIHtcbiAgICBwcml2YXRlIHJlYWRvbmx5IF9zZWdtZW50czogU2VnbWVudFtdO1xuICAgIHByaXZhdGUgcmVhZG9ubHkgX2FkQnJlYWtzOiBBZEJyZWFrW107XG5cbiAgICBjb25zdHJ1Y3RvcihzZWdtZW50czogU2VnbWVudFtdKSB7XG4gICAgICAgIHRoaXMuX3NlZ21lbnRzID0gc2VnbWVudHM7XG4gICAgICAgIHRoaXMuX2FkQnJlYWtzID0gW107XG4gICAgICAgIHRoaXMuX2luaXRBZGJyZWFrcygpO1xuICAgIH1cblxuICAgIGZpbmRTZWdtZW50KHRpbWU6IG51bWJlcik6IFNlZ21lbnQgfCB1bmRlZmluZWQge1xuICAgICAgICBsZXQgaW5kZXggPSB0aGlzLmdldFNlZ21lbnRJbmRleEF0KHRpbWUpO1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRTZWdtZW50QXQoaW5kZXgpO1xuICAgIH1cblxuICAgIGdldFNlZ21lbnRBdChpbmRleDogbnVtYmVyKTogU2VnbWVudCB7XG4gICAgICAgIGlmIChpbmRleCA+PSAwICYmIGluZGV4IDwgdGhpcy5fc2VnbWVudHMubGVuZ3RoKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fc2VnbWVudHNbaW5kZXhdO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICBnZXRTZWdtZW50SW5kZXhBdCh0aW1lOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX3NlZ21lbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBsZXQgc2VnbWVudCA9IHRoaXMuX3NlZ21lbnRzW2ldO1xuICAgICAgICAgICAgaWYgKHNlZ21lbnQuc3RhcnRUaW1lIDw9IHRpbWUgJiYgdGltZSA8PSBzZWdtZW50LmVuZFRpbWUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gaTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiAtMTtcbiAgICB9XG5cbiAgICBnZXQgbGVuZ3RoKCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLl9zZWdtZW50cy5sZW5ndGg7XG4gICAgfVxuXG4gICAgZ2V0IGFkQnJlYWtzKCk6IEFkQnJlYWtbXSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZEJyZWFrcztcbiAgICB9XG5cbiAgICBnZXQgY29udGVudFNlZ21lbnRzKCk6IFNlZ21lbnRbXSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9zZWdtZW50cy5maWx0ZXIoU2VnbWVudE1hcC5pc0NvbnRlbnQpO1xuICAgIH1cblxuICAgIHN0YXRpYyBpc0FkKHNlZ21lbnQ6IFNlZ21lbnQpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHNlZ21lbnQudHlwZSA9PT0gXCJBRFwiO1xuICAgIH1cblxuICAgIHN0YXRpYyBpc0NvbnRlbnQoc2VnbWVudDogU2VnbWVudCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gc2VnbWVudC50eXBlID09PSBcIkNPTlRFTlRcIjtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9pbml0QWRicmVha3MoKTogdm9pZCB7XG4gICAgICAgIGxldCBhZHM6IFNlZ21lbnRbXSA9IFtdO1xuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fc2VnbWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHdoaWxlIChpIDwgdGhpcy5fc2VnbWVudHMubGVuZ3RoICYmIFNlZ21lbnRNYXAuaXNBZCh0aGlzLl9zZWdtZW50c1tpXSkpIHtcbiAgICAgICAgICAgICAgICBhZHMucHVzaCh0aGlzLl9zZWdtZW50c1tpXSk7XG4gICAgICAgICAgICAgICAgaSsrXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChhZHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgIHRoaXMuX2FkQnJlYWtzLnB1c2gobmV3IEFkQnJlYWsoYWRzKSk7XG4gICAgICAgICAgICAgICAgYWRzID0gW107XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpbkFkQnJlYWsodGltZTogbnVtYmVyKTogYm9vbGVhbiB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fYWRCcmVha3MubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGxldCBhZEJyZWFrID0gdGhpcy5fYWRCcmVha3NbaV07XG4gICAgICAgICAgICBpZiAoYWRCcmVhay5jb250YWlucyh0aW1lKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGdldEFkQnJlYWsodGltZTogbnVtYmVyKTogQWRCcmVhayB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZEJyZWFrcy5maW5kKChhZEJyZWFrOiBBZEJyZWFrKTogYm9vbGVhbiA9PiB7XG4gICAgICAgICAgICByZXR1cm4gYWRCcmVhay5jb250YWlucyh0aW1lKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZ2V0QWRCcmVha3NCZXR3ZWVuKHN0YXJ0OiBudW1iZXIsIGVuZDogbnVtYmVyKTogQWRCcmVha1tdIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkQnJlYWtzLmZpbHRlcigoYWRCcmVhazogQWRCcmVhayk6IGJvb2xlYW4gPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHN0YXJ0IDw9IGFkQnJlYWsuc3RhcnRUaW1lICYmIGFkQnJlYWsuZW5kVGltZSA8PSBlbmQ7XG4gICAgICAgIH0pO1xuICAgIH1cbn0iLCJleHBvcnQgY2xhc3MgU3RyaW5nTWFwPFY+IHtcbiAgICBwcml2YXRlIF9tYXA6IGFueTtcblxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB0aGlzLl9tYXAgPSBuZXcgT2JqZWN0KCk7XG4gICAgfVxuXG4gICAgZ2V0IHNpemUoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIE9iamVjdC5rZXlzKHRoaXMuX21hcCkubGVuZ3RoO1xuICAgIH1cblxuICAgIGhhcyhrZXk6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5fbWFwLmhhc093blByb3BlcnR5KGtleSk7XG4gICAgfVxuXG4gICAgZ2V0KGtleTogc3RyaW5nKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9tYXBba2V5XTtcbiAgICB9XG5cbiAgICBzZXQoa2V5OiBzdHJpbmcsIHZhbHVlOiBWKSB7XG4gICAgICAgIHRoaXMuX21hcFtrZXldID0gdmFsdWU7XG4gICAgfVxuXG4gICAgY2xlYXIoKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyh0aGlzLl9tYXApO1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGtleXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IGtleSA9IGtleXNbaV07XG4gICAgICAgICAgICB0aGlzLl9tYXBba2V5XSA9IG51bGw7XG4gICAgICAgICAgICBkZWxldGUgdGhpcy5fbWFwW2tleV07XG4gICAgICAgIH1cbiAgICB9XG59IiwiaW1wb3J0IHsgdG9IZXhTdHJpbmcgfSBmcm9tICcuL3V0aWxzJztcbmltcG9ydCB7IFRodW1iLCBBc3NldEluZm8sIEFzc2V0SW5mb1NlcnZpY2UgfSBmcm9tICcuLi93ZWItc2VydmljZXMvYXNzZXQtaW5mby1zZXJ2aWNlJztcbmltcG9ydCB7IFNlZ21lbnRNYXAgfSBmcm9tICcuL3NlZ21lbnQtbWFwJztcblxuZXhwb3J0IGludGVyZmFjZSBUaHVtYm5haWwge1xuICAgIHVybDogc3RyaW5nO1xuICAgIGhlaWdodDogbnVtYmVyO1xuICAgIHdpZHRoOiBudW1iZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRUaHVtYm5haWwodGltZTogbnVtYmVyLCBzZWdtZW50czogU2VnbWVudE1hcCwgYXNzZXRJbmZvU2VydmljZTogQXNzZXRJbmZvU2VydmljZSwgdGh1bWJuYWlsU2l6ZTogXCJzbWFsbFwiIHwgXCJsYXJnZVwiID0gXCJzbWFsbFwiKTogVGh1bWJuYWlsIHtcbiAgICBpZiAoaXNOYU4odGltZSkgfHwgdGltZSA8IDApIHtcbiAgICAgICAgdGltZSA9IDA7XG4gICAgfVxuXG4gICAgaWYgKGFzc2V0SW5mb1NlcnZpY2UpIHtcbiAgICAgICAgY29uc3Qgc2VnbWVudCA9IHNlZ21lbnRzLmZpbmRTZWdtZW50KHRpbWUpO1xuICAgICAgICBpZiAoc2VnbWVudCkge1xuICAgICAgICAgICAgY29uc3QgYXNzZXQgPSBhc3NldEluZm9TZXJ2aWNlLmdldEFzc2V0SW5mbyhzZWdtZW50LmlkKTtcbiAgICAgICAgICAgIGlmIChhc3NldCAmJiBhc3NldC50aHVtYnMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBzbGljZU51bWJlciA9IGdldFNsaWNlTnVtYmVyKHRpbWUsIHNlZ21lbnQsIGFzc2V0KTtcbiAgICAgICAgICAgICAgICBjb25zdCB0aHVtYiA9IGdldFRodW1iKGFzc2V0LCB0aHVtYm5haWxTaXplKTtcblxuICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgIHVybDogZ2V0VGh1bWJuYWlsVXJsKGFzc2V0LCBzbGljZU51bWJlciwgdGh1bWIpLFxuICAgICAgICAgICAgICAgICAgICBoZWlnaHQ6IHRodW1iLmhlaWdodCxcbiAgICAgICAgICAgICAgICAgICAgd2lkdGg6IHRodW1iLndpZHRoXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgdXJsOiAnJyxcbiAgICAgICAgaGVpZ2h0OiAwLFxuICAgICAgICB3aWR0aDogMFxuICAgIH07XG59XG5cbmZ1bmN0aW9uIGdldFRodW1ibmFpbFVybChhc3NldDogQXNzZXRJbmZvLCBzbGljZU51bWJlcjogbnVtYmVyLCB0aHVtYjogVGh1bWIpOiBzdHJpbmcge1xuICAgIGxldCBwcmVmaXggPSBhc3NldC50aHVtYlByZWZpeDtcblxuICAgIGlmIChhc3NldC5zdG9yYWdlUGFydGl0aW9ucyAmJiBhc3NldC5zdG9yYWdlUGFydGl0aW9ucy5sZW5ndGgpIHtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhc3NldC5zdG9yYWdlUGFydGl0aW9ucy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgcGFydGl0aW9uID0gYXNzZXQuc3RvcmFnZVBhcnRpdGlvbnNbaV07XG4gICAgICAgICAgICBpZiAocGFydGl0aW9uLnN0YXJ0IDw9IHNsaWNlTnVtYmVyICYmIHNsaWNlTnVtYmVyIDwgcGFydGl0aW9uLmVuZCkge1xuICAgICAgICAgICAgICAgIHByZWZpeCA9IHBhcnRpdGlvbi51cmw7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAocHJlZml4W3ByZWZpeC5sZW5ndGggLSAxXSAhPT0gJy8nKSB7XG4gICAgICAgIHByZWZpeCArPSAnLyc7XG4gICAgfVxuXG4gICAgY29uc3Qgc2xpY2VIZXhOdW1iZXIgPSB0b0hleFN0cmluZyhzbGljZU51bWJlcik7XG5cbiAgICByZXR1cm4gYCR7cHJlZml4fSR7dGh1bWIucHJlZml4fSR7c2xpY2VIZXhOdW1iZXJ9LmpwZ2A7XG59XG5cbmZ1bmN0aW9uIGdldFRodW1iKGFzc2V0OiBBc3NldEluZm8sIHNpemU6ICdzbWFsbCcgfCAnbGFyZ2UnKTogVGh1bWIge1xuICAgIC8vZGVmYXVsdCB0byBzbWFsbGVzdCB0aHVtYlxuICAgIGxldCB0aHVtYjogVGh1bWIgPSBhc3NldC50aHVtYnNbMF07XG5cbiAgICBpZiAoc2l6ZSA9PT0gXCJsYXJnZVwiKSB7XG4gICAgICAgIC8vbGFzdCB0aHVtYiBpcyB0aGUgbGFyZ2VzdFxuICAgICAgICB0aHVtYiA9IGFzc2V0LnRodW1ic1thc3NldC50aHVtYnMubGVuZ3RoIC0gMV07XG4gICAgfVxuXG4gICAgcmV0dXJuIHRodW1iO1xufVxuXG5cbmZ1bmN0aW9uIGdldFNsaWNlTnVtYmVyKHRpbWU6IG51bWJlciwgc2VnbWVudDogU2VnbWVudCwgYXNzZXQ6IEFzc2V0SW5mbyk6IG51bWJlciB7XG4gICAgbGV0IHNsaWNlTnVtYmVyID0gTWF0aC5jZWlsKCh0aW1lIC0gc2VnbWVudC5zdGFydFRpbWUpIC8gYXNzZXQuc2xpY2VEdXJhdGlvbik7XG4gICAgc2xpY2VOdW1iZXIgKz0gc2VnbWVudC5pbmRleDtcblxuICAgIGlmIChzbGljZU51bWJlciA+IGFzc2V0Lm1heFNsaWNlKSB7XG4gICAgICAgIHNsaWNlTnVtYmVyID0gYXNzZXQubWF4U2xpY2U7XG4gICAgfVxuXG4gICAgcmV0dXJuIHNsaWNlTnVtYmVyO1xufVxuIiwiZXhwb3J0IGZ1bmN0aW9uIHRvVGltZVN0cmluZyh0aW1lOiBudW1iZXIpIHtcbiAgICBpZiAoaXNOYU4odGltZSkpIHtcbiAgICAgICAgdGltZSA9IDA7XG4gICAgfVxuXG4gICAgbGV0IG5lZ2F0aXZlID0gKHRpbWUgPCAwKSA/IFwiLVwiIDogXCJcIjtcblxuICAgIHRpbWUgPSBNYXRoLmFicyh0aW1lKTtcblxuICAgIGxldCBzZWNvbmRzID0gKHRpbWUgJSA2MCkgfCAwO1xuICAgIGxldCBtaW51dGVzID0gKCh0aW1lIC8gNjApICUgNjApIHwgMDtcbiAgICBsZXQgaG91cnMgPSAoKCh0aW1lIC8gNjApIC8gNjApICUgNjApIHwgMDtcbiAgICBsZXQgc2hvd0hvdXJzID0gaG91cnMgPiAwO1xuXG4gICAgbGV0IGhyU3RyID0gaG91cnMgPCAxMCA/IGAwJHtob3Vyc31gIDogYCR7aG91cnN9YDtcbiAgICBsZXQgbWluU3RyID0gbWludXRlcyA8IDEwID8gYDAke21pbnV0ZXN9YCA6IGAke21pbnV0ZXN9YDtcbiAgICBsZXQgc2VjU3RyID0gc2Vjb25kcyA8IDEwID8gYDAke3NlY29uZHN9YCA6IGAke3NlY29uZHN9YDtcblxuICAgIGlmIChzaG93SG91cnMpIHtcbiAgICAgICAgcmV0dXJuIGAke25lZ2F0aXZlfSR7aHJTdHJ9OiR7bWluU3RyfToke3NlY1N0cn1gO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBgJHtuZWdhdGl2ZX0ke21pblN0cn06JHtzZWNTdHJ9YDtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b0hleFN0cmluZyhudW1iZXI6IG51bWJlciwgbWluTGVuZ3RoID0gOCk6IHN0cmluZyB7XG4gICAgbGV0IGhleCA9IG51bWJlci50b1N0cmluZygxNikudG9VcHBlckNhc2UoKTtcbiAgICB3aGlsZSAoaGV4Lmxlbmd0aCA8IG1pbkxlbmd0aCkge1xuICAgICAgICBoZXggPSBcIjBcIiArIGhleDtcbiAgICB9XG5cbiAgICByZXR1cm4gaGV4O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYmFzZTY0VG9CdWZmZXIoYjY0ZW5jb2RlZDogc3RyaW5nKTogVWludDhBcnJheSB7XG4gICAgcmV0dXJuIG5ldyBVaW50OEFycmF5KGF0b2IoYjY0ZW5jb2RlZCkuc3BsaXQoXCJcIikubWFwKGZ1bmN0aW9uIChjKSB7IHJldHVybiBjLmNoYXJDb2RlQXQoMCk7IH0pKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gc2xpY2UoZGF0YTogVWludDhBcnJheSwgc3RhcnQ6IG51bWJlciwgZW5kPzogbnVtYmVyKTogVWludDhBcnJheSB7XG4gICAgLy9JRSAxMSBkb2Vzbid0IHN1cHBvcnQgc2xpY2UoKSBvbiBUeXBlZEFycmF5IG9iamVjdHNcbiAgICBpZiAoZGF0YS5zbGljZSkge1xuICAgICAgICByZXR1cm4gZGF0YS5zbGljZShzdGFydCwgZW5kKTtcbiAgICB9XG5cbiAgICBpZiAoZW5kKSB7XG4gICAgICAgIHJldHVybiBkYXRhLnN1YmFycmF5KHN0YXJ0LCBlbmQpO1xuICAgIH1cblxuICAgIHJldHVybiBkYXRhLnN1YmFycmF5KHN0YXJ0KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzTG9jYWxTdG9yYWdlQXZhaWxhYmxlKClcbntcbiAgICAvLyBDb3BpZWQgZnJvbSBQbHlyIGNvZGVcbiAgICBpZiAoISgnbG9jYWxTdG9yYWdlJyBpbiB3aW5kb3cpKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICAvLyBUcnkgdG8gdXNlIGl0IChpdCBtaWdodCBiZSBkaXNhYmxlZCwgZS5nLiB1c2VyIGlzIGluIHByaXZhdGUgbW9kZSlcbiAgICAvLyBzZWU6IGh0dHBzOi8vZ2l0aHViLmNvbS9TZWx6L3BseXIvaXNzdWVzLzEzMVxuICAgIHRyeSB7XG4gICAgICAgIC8vIEFkZCB0ZXN0IGl0ZW1cbiAgICAgICAgd2luZG93LmxvY2FsU3RvcmFnZS5zZXRJdGVtKCdfX190ZXN0JywgJ09LJyk7XG5cbiAgICAgICAgLy8gR2V0IHRoZSB0ZXN0IGl0ZW1cbiAgICAgICAgdmFyIHJlc3VsdCA9IHdpbmRvdy5sb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnX19fdGVzdCcpO1xuXG4gICAgICAgIC8vIENsZWFuIHVwXG4gICAgICAgIHdpbmRvdy5sb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbSgnX19fdGVzdCcpO1xuXG4gICAgICAgIC8vIENoZWNrIGlmIHZhbHVlIG1hdGNoZXNcbiAgICAgICAgcmV0dXJuIChyZXN1bHQgPT09ICdPSycpO1xuICAgIH1cbiAgICBjYXRjaCAoZSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UHJvdG9jb2wodXJsOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIHRyeSB7XG4gICAgICAgIC8vbm90IGFsbCBicm93c2VycyBzdXBwb3J0IFVSTCBhcGkgKElFMTEuLi4pXG4gICAgICAgIHJldHVybiBuZXcgVVJMKHVybCkucHJvdG9jb2w7XG4gICAgfSBjYXRjaCAoXykgeyB9XG5cbiAgICB2YXIgbGluayA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcbiAgICBsaW5rLnNldEF0dHJpYnV0ZSgnaHJlZicsIHVybCk7XG5cbiAgICByZXR1cm4gbGluay5wcm90b2NvbDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzSUUxMU9yRWRnZSgpOiBib29sZWFuIHtcbiAgICBsZXQgaXNJRTExID0gKG5hdmlnYXRvci5hcHBWZXJzaW9uLmluZGV4T2YoJ1dpbmRvd3MgTlQnKSAhPT0gLTEpICYmIChuYXZpZ2F0b3IuYXBwVmVyc2lvbi5pbmRleE9mKCdydjoxMScpICE9PSAtMSk7XG4gICAgbGV0IGlzRWRnZSA9IG5hdmlnYXRvci5hcHBWZXJzaW9uLmluZGV4T2YoJ0VkZ2UnKSAhPT0gLTE7XG4gICAgcmV0dXJuIGlzSUUxMSB8fCBpc0VkZ2U7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzdHJpbmdUb0FycmF5MTYoc3RyaW5nRGF0YTogc3RyaW5nKTogVWludDE2QXJyYXkge1xuICAgIGxldCBidWZmZXIgPSBuZXcgQXJyYXlCdWZmZXIoc3RyaW5nRGF0YS5sZW5ndGggKiAyKTsgLy8gMiBieXRlcyBmb3IgZWFjaCBjaGFyXG4gICAgbGV0IGFycmF5ID0gbmV3IFVpbnQxNkFycmF5KGJ1ZmZlcik7XG4gICAgZm9yIChsZXQgaSA9IDAsIHN0ckxlbiA9IHN0cmluZ0RhdGEubGVuZ3RoOyBpIDwgc3RyTGVuOyBpKyspIHtcbiAgICAgICAgYXJyYXlbaV0gPSBzdHJpbmdEYXRhLmNoYXJDb2RlQXQoaSk7XG4gICAgfVxuICAgIHJldHVybiBhcnJheTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFycmF5MTZUb1N0cmluZyhhcnJheTogVWludDE2QXJyYXkpOiBTdHJpbmcge1xuICAgIGxldCB1aW50MTZhcnJheSA9IG5ldyBVaW50MTZBcnJheShhcnJheS5idWZmZXIpO1xuICAgIHJldHVybiBTdHJpbmcuZnJvbUNoYXJDb2RlLmFwcGx5KG51bGwsIHVpbnQxNmFycmF5KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGJhc2U2NERlY29kZVVpbnQ4QXJyYXkoaW5wdXQ6IGFueSk6IFVpbnQ4QXJyYXkge1xuICAgIGxldCByYXcgPSB3aW5kb3cuYXRvYihpbnB1dCk7XG4gICAgbGV0IHJhd0xlbmd0aCA9IHJhdy5sZW5ndGg7XG4gICAgbGV0IGFycmF5ID0gbmV3IFVpbnQ4QXJyYXkobmV3IEFycmF5QnVmZmVyKHJhd0xlbmd0aCkpO1xuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCByYXdMZW5ndGg7IGkrKylcbiAgICAgICAgYXJyYXlbaV0gPSByYXcuY2hhckNvZGVBdChpKTtcblxuICAgIHJldHVybiBhcnJheTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGJhc2U2NEVuY29kZVVpbnQ4QXJyYXkoaW5wdXQ6IFVpbnQ4QXJyYXkpOiBzdHJpbmcge1xuICAgIGxldCBrZXlTdHIgPSBcIkFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU2Nzg5Ky89XCI7XG4gICAgbGV0IG91dHB1dCA9IFwiXCI7XG4gICAgbGV0IGNocjEsIGNocjIsIGNocjMsIGVuYzEsIGVuYzIsIGVuYzMsIGVuYzQ7XG4gICAgbGV0IGkgPSAwO1xuXG4gICAgd2hpbGUgKGkgPCBpbnB1dC5sZW5ndGgpIHtcbiAgICAgICAgY2hyMSA9IGlucHV0W2krK107XG4gICAgICAgIGNocjIgPSBpIDwgaW5wdXQubGVuZ3RoID8gaW5wdXRbaSsrXSA6IE51bWJlci5OYU47IC8vIE5vdCBzdXJlIGlmIHRoZSBpbmRleFxuICAgICAgICBjaHIzID0gaSA8IGlucHV0Lmxlbmd0aCA/IGlucHV0W2krK10gOiBOdW1iZXIuTmFOOyAvLyBjaGVja3MgYXJlIG5lZWRlZCBoZXJlXG5cbiAgICAgICAgZW5jMSA9IGNocjEgPj4gMjtcbiAgICAgICAgZW5jMiA9ICgoY2hyMSAmIDMpIDw8IDQpIHwgKGNocjIgPj4gNCk7XG4gICAgICAgIGVuYzMgPSAoKGNocjIgJiAxNSkgPDwgMikgfCAoY2hyMyA+PiA2KTtcbiAgICAgICAgZW5jNCA9IGNocjMgJiA2MztcblxuICAgICAgICBpZiAoaXNOYU4oY2hyMikpIHtcbiAgICAgICAgICAgIGVuYzMgPSBlbmM0ID0gNjQ7XG4gICAgICAgIH0gZWxzZSBpZiAoaXNOYU4oY2hyMykpIHtcbiAgICAgICAgICAgIGVuYzQgPSA2NDtcbiAgICAgICAgfVxuICAgICAgICBvdXRwdXQgKz0ga2V5U3RyLmNoYXJBdChlbmMxKSArIGtleVN0ci5jaGFyQXQoZW5jMikgK1xuICAgICAgICAgICAga2V5U3RyLmNoYXJBdChlbmMzKSArIGtleVN0ci5jaGFyQXQoZW5jNCk7XG4gICAgfVxuICAgIHJldHVybiBvdXRwdXQ7XG59IiwiaW1wb3J0IHsgU2VnbWVudE1hcCB9IGZyb20gJy4uL3V0aWxzL3NlZ21lbnQtbWFwJztcbmltcG9ydCB7IFN0cmluZ01hcCB9IGZyb20gJy4uL3V0aWxzL3N0cmluZy1tYXAnO1xuXG5jb25zdCBlbnVtIFR2UmF0aW5nIHtcbiAgICBOb3RBdmFpbGFibGUgPSAtMSxcbiAgICBOb3RBcHBsaWNhYmxlID0gMCxcbiAgICBUVl9ZID0gMSxcbiAgICBUVl9ZNyA9IDIsXG4gICAgVFZfRyA9IDMsXG4gICAgVFZfUEcgPSA0LFxuICAgIFRWXzE0ID0gNSxcbiAgICBUVl9NQSA9IDYsXG4gICAgTm90UmF0ZWQgPSA3XG59XG5cbmNvbnN0IGVudW0gTW92aWVSYXRpbmcge1xuICAgIE5vdEF2YWlsYWJsZSA9IC0xLFxuICAgIE5vdEFwcGxpY2FibGUgPSAwLFxuICAgIEcgPSAxLFxuICAgIFBHID0gMixcbiAgICBQR18xMyA9IDMsXG4gICAgUiA9IDQsXG4gICAgTkNfMTcgPSA1LFxuICAgIFggPSA2LFxuICAgIE5vdFJhdGVkID0gN1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFRodW1iIHtcbiAgICB3aWR0aDogbnVtYmVyO1xuICAgIHByZWZpeDogc3RyaW5nO1xuICAgIGhlaWdodDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN0b3JhZ2VQYXJpdGlvbiB7XG4gICAgLyoqXG4gICAgICogU3RhcnRpbmcgc2xpY2UgbnVtYmVyLCBpbmNsdXNpdmVcbiAgICAgKi9cbiAgICBzdGFydDogbnVtYmVyO1xuXG4gICAgLyoqXG4gICAgICogRW5kaW5nIHNsaWNlIG51bWJlciwgZXhjbHVzaXZlXG4gICAgICovXG4gICAgZW5kOiBudW1iZXI7XG4gICAgdXJsOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBBc3NldEluZm9TZXJpYWxpemVkIHtcbiAgICBhdWRpb19vbmx5OiBudW1iZXI7XG4gICAgZXJyb3I6IG51bWJlcjtcbiAgICB0dl9yYXRpbmc6IG51bWJlcjtcbiAgICBzdG9yYWdlX3BhcnRpdGlvbnM6IFN0b3JhZ2VQYXJpdGlvbltdO1xuICAgIG1heF9zbGljZTogbnVtYmVyO1xuICAgIHRodW1iX3ByZWZpeDogc3RyaW5nO1xuICAgIGFkX2RhdGE6IE9iamVjdDtcbiAgICBzbGljZV9kdXI6IG51bWJlcjtcbiAgICBtb3ZpZV9yYXRpbmc6IG51bWJlcjtcbiAgICBvd25lcjogc3RyaW5nO1xuICAgIHJhdGVzOiBudW1iZXJbXTtcbiAgICB0aHVtYnM6IFRodW1iW107XG4gICAgcG9zdGVyX3VybDogc3RyaW5nO1xuICAgIGR1cmF0aW9uOiBudW1iZXI7XG4gICAgZGVmYXVsdF9wb3N0ZXJfdXJsOiBzdHJpbmc7XG4gICAgZGVzYzogc3RyaW5nO1xuICAgIHJhdGluZ19mbGFnczogbnVtYmVyO1xuICAgIGV4dGVybmFsX2lkOiBzdHJpbmc7XG4gICAgaXNfYWQ6IG51bWJlcjtcbiAgICBhc3NldDogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgQWREYXRhIHtcbiAgICBjbGljaz86IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgY2xhc3MgQXNzZXRJbmZvIHtcbiAgICByZWFkb25seSBhdWRpb09ubHk6IGJvb2xlYW47XG4gICAgcmVhZG9ubHkgZXJyb3I6IGJvb2xlYW47XG4gICAgcmVhZG9ubHkgdHZSYXRpbmc6IFR2UmF0aW5nO1xuICAgIHJlYWRvbmx5IHN0b3JhZ2VQYXJ0aXRpb25zOiBTdG9yYWdlUGFyaXRpb25bXTtcbiAgICByZWFkb25seSBtYXhTbGljZTogbnVtYmVyO1xuICAgIHJlYWRvbmx5IHRodW1iUHJlZml4OiBzdHJpbmc7XG4gICAgcmVhZG9ubHkgYWREYXRhOiBBZERhdGE7XG4gICAgcmVhZG9ubHkgc2xpY2VEdXJhdGlvbjogbnVtYmVyO1xuICAgIHJlYWRvbmx5IG1vdmllUmF0aW5nOiBNb3ZpZVJhdGluZztcbiAgICByZWFkb25seSBvd25lcjogc3RyaW5nO1xuICAgIHJlYWRvbmx5IHJhdGVzOiBudW1iZXJbXTtcbiAgICByZWFkb25seSB0aHVtYnM6IFRodW1iW107XG4gICAgcmVhZG9ubHkgcG9zdGVyVXJsOiBzdHJpbmc7XG4gICAgcmVhZG9ubHkgZHVyYXRpb246IG51bWJlcjtcbiAgICByZWFkb25seSBkZWZhdWx0UG9zdGVyVXJsOiBzdHJpbmc7XG4gICAgcmVhZG9ubHkgZGVzY3JpcHRpb246IHN0cmluZztcbiAgICByZWFkb25seSByYXRpbmdGbGFnczogbnVtYmVyO1xuICAgIHJlYWRvbmx5IGV4dGVybmFsSWQ6IHN0cmluZztcbiAgICByZWFkb25seSBpc0FkOiBib29sZWFuO1xuICAgIHJlYWRvbmx5IGFzc2V0OiBzdHJpbmc7XG5cbiAgICBjb25zdHJ1Y3RvcihvYmo6IEFzc2V0SW5mb1NlcmlhbGl6ZWQsIGlzQWQ6IGJvb2xlYW4gfCBudWxsKSB7XG4gICAgICAgIHRoaXMuYXVkaW9Pbmx5ID0gb2JqLmF1ZGlvX29ubHkgPT0gMTtcbiAgICAgICAgdGhpcy5lcnJvciA9IG9iai5lcnJvciA9PSAxO1xuICAgICAgICB0aGlzLnR2UmF0aW5nID0gb2JqLnR2X3JhdGluZztcbiAgICAgICAgdGhpcy5zdG9yYWdlUGFydGl0aW9ucyA9IG9iai5zdG9yYWdlX3BhcnRpdGlvbnM7XG4gICAgICAgIHRoaXMubWF4U2xpY2UgPSBvYmoubWF4X3NsaWNlO1xuICAgICAgICB0aGlzLnRodW1iUHJlZml4ID0gb2JqLnRodW1iX3ByZWZpeDtcbiAgICAgICAgdGhpcy5hZERhdGEgPSBvYmouYWRfZGF0YTtcbiAgICAgICAgdGhpcy5zbGljZUR1cmF0aW9uID0gb2JqLnNsaWNlX2R1cjtcbiAgICAgICAgdGhpcy5tb3ZpZVJhdGluZyA9IG9iai5tb3ZpZV9yYXRpbmc7XG4gICAgICAgIHRoaXMub3duZXIgPSBvYmoub3duZXI7XG4gICAgICAgIHRoaXMucmF0ZXMgPSBvYmoucmF0ZXM7XG4gICAgICAgIHRoaXMudGh1bWJzID0gb2JqLnRodW1icztcbiAgICAgICAgdGhpcy5wb3N0ZXJVcmwgPSBvYmoucG9zdGVyX3VybDtcbiAgICAgICAgdGhpcy5kdXJhdGlvbiA9IG9iai5kdXJhdGlvbjtcbiAgICAgICAgdGhpcy5kZWZhdWx0UG9zdGVyVXJsID0gb2JqLmRlZmF1bHRfcG9zdGVyX3VybDtcbiAgICAgICAgdGhpcy5kZXNjcmlwdGlvbiA9IG9iai5kZXNjO1xuICAgICAgICB0aGlzLnJhdGluZ0ZsYWdzID0gb2JqLnJhdGluZ19mbGFncztcbiAgICAgICAgdGhpcy5leHRlcm5hbElkID0gb2JqLmV4dGVybmFsX2lkO1xuICAgICAgICB0aGlzLmFzc2V0ID0gb2JqLmFzc2V0O1xuXG4gICAgICAgIC8vdXNlIHZhbHVlIGZyb20gU2VnbWVudE1hcCBpZiBhdmFpbGFibGUgKCMxMTgsIFVQLTQzNTQpXG4gICAgICAgIGlmIChpc0FkID09IG51bGwpIHtcbiAgICAgICAgICAgIHRoaXMuaXNBZCA9IG9iai5pc19hZCA9PT0gMTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuaXNBZCA9IGlzQWQ7XG4gICAgICAgIH1cblxuICAgICAgICAvL3NvcnQgdGh1bWJzIGJ5IGltYWdlIHdpZHRoLCBzbWFsbGVzdCB0byBsYXJnZXN0XG4gICAgICAgIC8vIHRodW1icyBtYXkgYmUgdW5kZWZpbmVkIHdoZW4gcGxheWluZyBhbiBhdWRpby1vbmx5IGFzc2V0XG4gICAgICAgIGlmICh0aGlzLnRodW1icykge1xuICAgICAgICAgICAgdGhpcy50aHVtYnMuc29ydChmdW5jdGlvbiAobGVmdDogVGh1bWIsIHJpZ2h0OiBUaHVtYikge1xuICAgICAgICAgICAgICAgIHJldHVybiBsZWZ0LndpZHRoIC0gcmlnaHQud2lkdGg7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vY2xhbXAgc3RvcmFnZSBwYXJ0aXRpb24gc2xpY2UgZW5kIG51bWJlcnMgYXMgdGhleSBjYW4gYmUgbGFyZ2VyIHRoYW5cbiAgICAgICAgLy8gamF2YXNjcmlwdCBjYW4gc2FmZWx5IHJlcHJlc2VudFxuICAgICAgICBpZiAodGhpcy5zdG9yYWdlUGFydGl0aW9ucyAmJiB0aGlzLnN0b3JhZ2VQYXJ0aXRpb25zLmxlbmd0aCkge1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLnN0b3JhZ2VQYXJ0aXRpb25zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgLy9OdW1iZXIuTUFYX1NBRkVfSU5URUdFUiA9PT0gOTAwNzE5OTI1NDc0MDk5MVxuICAgICAgICAgICAgICAgIC8vTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIgbm90IHN1cHBvcnRlZCBpbiBJRVxuICAgICAgICAgICAgICAgIHRoaXMuc3RvcmFnZVBhcnRpdGlvbnNbaV0uZW5kID0gTWF0aC5taW4odGhpcy5zdG9yYWdlUGFydGl0aW9uc1tpXS5lbmQsIDkwMDcxOTkyNTQ3NDA5OTEpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxufVxuXG5leHBvcnQgY2xhc3MgQXNzZXRJbmZvU2VydmljZSB7XG4gICAgcHJpdmF0ZSByZWFkb25seSBfcHJvdG9jb2w6IHN0cmluZztcbiAgICBwcml2YXRlIHJlYWRvbmx5IF9kb21haW46IHN0cmluZztcbiAgICBwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uSWQ6IHN0cmluZztcbiAgICBwcml2YXRlIHJlYWRvbmx5IF9jYWNoZTogU3RyaW5nTWFwPEFzc2V0SW5mbz47XG5cbiAgICBjb25zdHJ1Y3Rvcihwcm90b2NvbDogc3RyaW5nLCBkb21haW46IHN0cmluZywgc2Vzc2lvbklkPzogc3RyaW5nKSB7XG4gICAgICAgIHRoaXMuX3Byb3RvY29sID0gcHJvdG9jb2w7XG4gICAgICAgIHRoaXMuX2RvbWFpbiA9IGRvbWFpbjtcbiAgICAgICAgdGhpcy5fc2Vzc2lvbklkID0gc2Vzc2lvbklkO1xuICAgICAgICB0aGlzLl9jYWNoZSA9IG5ldyBTdHJpbmdNYXA8QXNzZXRJbmZvPigpO1xuXG4gICAgICAgIHRoaXMuX2xvYWRTZWdtZW50cyA9IHRoaXMuX2xvYWRTZWdtZW50cy5iaW5kKHRoaXMpO1xuICAgIH1cblxuICAgIGxvYWRTZWdtZW50TWFwKHNlZ21lbnRNYXA6IFNlZ21lbnRNYXAsIGNhbGxiYWNrOiAoKSA9PiB2b2lkKTogdm9pZCB7XG4gICAgICAgIGxldCBzZWdtZW50czogU2VnbWVudFtdID0gW107XG5cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzZWdtZW50TWFwLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBsZXQgc2VnbWVudCA9IHNlZ21lbnRNYXAuZ2V0U2VnbWVudEF0KGkpO1xuICAgICAgICAgICAgaWYgKHNlZ21lbnQuaWQgJiYgc2VnbWVudC5pZCAhPT0gJycpIHtcbiAgICAgICAgICAgICAgICBzZWdtZW50cy5wdXNoKHNlZ21lbnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fbG9hZFNlZ21lbnRzKHNlZ21lbnRzLCBjYWxsYmFjayk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfbG9hZFNlZ21lbnRzKHNlZ21lbnRzOiBTZWdtZW50W10sIGNhbGxiYWNrOiAoKSA9PiB2b2lkKTogdm9pZCB7XG4gICAgICAgIGlmIChzZWdtZW50cy5sZW5ndGggPT0gMCkge1xuICAgICAgICAgICAgY2FsbGJhY2soKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBzZWdtZW50ID0gc2VnbWVudHMuc2hpZnQoKTtcbiAgICAgICAgdGhpcy5sb2FkU2VnbWVudChzZWdtZW50LCAoKSA9PiB7XG4gICAgICAgICAgICB0aGlzLl9sb2FkU2VnbWVudHMoc2VnbWVudHMsIGNhbGxiYWNrKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgbG9hZEFzc2V0SWQoYXNzZXRJZDogc3RyaW5nLCBpc0FkOiBib29sZWFuIHwgbnVsbCwgY2FsbEJhY2s6IChhc3NldEluZm86IEFzc2V0SW5mbykgPT4gdm9pZCk6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy5pc0xvYWRlZChhc3NldElkKSkge1xuICAgICAgICAgICAgLy9hc3NldEluZm8gZm9yIGFzc2V0SWQgaXMgYWxyZWFkeSBsb2FkZWRcbiAgICAgICAgICAgIGxldCBpbmZvID0gdGhpcy5fY2FjaGUuZ2V0KGFzc2V0SWQpO1xuICAgICAgICAgICAgY2FsbEJhY2soaW5mbyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgdXJsID0gYCR7dGhpcy5fcHJvdG9jb2x9Ly8ke3RoaXMuX2RvbWFpbn0vcGxheWVyL2Fzc2V0aW5mby8ke2Fzc2V0SWR9Lmpzb25gO1xuXG4gICAgICAgIGlmICh0aGlzLl9zZXNzaW9uSWQgJiYgdGhpcy5fc2Vzc2lvbklkICE9IFwiXCIpIHtcbiAgICAgICAgICAgIHVybCA9IGAke3VybH0/cGJzPSR7dGhpcy5fc2Vzc2lvbklkfWA7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgeGhyID0gbmV3IFhNTEh0dHBSZXF1ZXN0KCk7XG4gICAgICAgIHhoci5vbmxvYWRlbmQgPSAoKTogdm9pZCA9PiB7XG4gICAgICAgICAgICBpZiAoeGhyLnN0YXR1cyA9PSAyMDApIHtcbiAgICAgICAgICAgICAgICBsZXQgb2JqID0gSlNPTi5wYXJzZSh4aHIucmVzcG9uc2VUZXh0KTtcbiAgICAgICAgICAgICAgICBsZXQgYXNzZXRJbmZvID0gbmV3IEFzc2V0SW5mbyhvYmosIGlzQWQpO1xuXG4gICAgICAgICAgICAgICAgLy9hZGQgYXNzZXRJbmZvIHRvIGNhY2hlXG4gICAgICAgICAgICAgICAgdGhpcy5fY2FjaGUuc2V0KGFzc2V0SWQsIGFzc2V0SW5mbyk7XG5cbiAgICAgICAgICAgICAgICBjYWxsQmFjayhhc3NldEluZm8pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjYWxsQmFjayhudWxsKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICB4aHIub3BlbihcIkdFVFwiLCB1cmwpO1xuICAgICAgICB4aHIuc2VuZCgpO1xuICAgIH1cblxuICAgIGxvYWRTZWdtZW50KHNlZ21lbnQ6IFNlZ21lbnQsIGNhbGxCYWNrOiAoYXNzZXRJbmZvOiBBc3NldEluZm8pID0+IHZvaWQpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgYXNzZXRJZDogc3RyaW5nID0gc2VnbWVudC5pZDtcbiAgICAgICAgY29uc3QgaXNBZCA9IFNlZ21lbnRNYXAuaXNBZChzZWdtZW50KTtcblxuICAgICAgICB0aGlzLmxvYWRBc3NldElkKGFzc2V0SWQsIGlzQWQsIGNhbGxCYWNrKTtcbiAgICB9XG5cbiAgICBpc0xvYWRlZChhc3NldElkOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NhY2hlLmhhcyhhc3NldElkKTtcbiAgICB9XG5cbiAgICBnZXRBc3NldEluZm8oYXNzZXRJZDogc3RyaW5nKTogQXNzZXRJbmZvIHtcbiAgICAgICAgaWYgKHRoaXMuaXNMb2FkZWQoYXNzZXRJZCkpIHtcbiAgICAgICAgICAgIGxldCBpbmZvID0gdGhpcy5fY2FjaGUuZ2V0KGFzc2V0SWQpO1xuICAgICAgICAgICAgcmV0dXJuIGluZm87XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIGNsZWFyKCk6IHZvaWQge1xuICAgICAgICB0aGlzLl9jYWNoZS5jbGVhcigpO1xuICAgIH1cbn1cbiIsImV4cG9ydCBjbGFzcyBQaW5nU2VydmljZSB7XG4gICAgcHJpdmF0ZSByZWFkb25seSBfcHJvdG9jb2w6IHN0cmluZztcbiAgICBwcml2YXRlIHJlYWRvbmx5IF9kb21haW46IHN0cmluZztcbiAgICBwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uSWQ6IHN0cmluZztcbiAgICBwcml2YXRlIHJlYWRvbmx5IF92aWRlbzogSFRNTFZpZGVvRWxlbWVudDtcblxuICAgIHByaXZhdGUgX3BpbmdTZXJ2ZXI6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSBfc2VudFN0YXJ0UGluZzogYm9vbGVhbjtcbiAgICBwcml2YXRlIF9zZWVraW5nOiBib29sZWFuO1xuXG4gICAgcHJpdmF0ZSBfY3VycmVudFRpbWU6IG51bWJlcjtcbiAgICBwcml2YXRlIF9zZWVrRnJvbVRpbWU6IG51bWJlcjtcbiAgICBwcml2YXRlIF9uZXh0VGltZTogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG4gICAgcHJpdmF0ZSByZWFkb25seSBTVEFSVCA9IFwic3RhcnRcIjtcbiAgICBwcml2YXRlIHJlYWRvbmx5IFNFRUsgPSBcInNlZWtcIjtcblxuICAgIGNvbnN0cnVjdG9yKHByb3RvY29sOiBzdHJpbmcsIGRvbWFpbjogc3RyaW5nLCBzZXNzaW9uSWQ6IHN0cmluZywgdmlkZW86IEhUTUxWaWRlb0VsZW1lbnQpIHtcblxuICAgICAgICB0aGlzLl9wcm90b2NvbCA9IHByb3RvY29sO1xuICAgICAgICB0aGlzLl9kb21haW4gPSBkb21haW47XG4gICAgICAgIHRoaXMuX3Nlc3Npb25JZCA9IHNlc3Npb25JZDtcbiAgICAgICAgdGhpcy5fdmlkZW8gPSB2aWRlbztcblxuICAgICAgICB0aGlzLl9waW5nU2VydmVyID0gc2Vzc2lvbklkICE9IG51bGwgJiYgc2Vzc2lvbklkICE9IFwiXCI7XG4gICAgICAgIHRoaXMuX25leHRUaW1lID0gdW5kZWZpbmVkO1xuXG4gICAgICAgIHRoaXMuX3NlbnRTdGFydFBpbmcgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fc2Vla2luZyA9IGZhbHNlO1xuXG4gICAgICAgIHRoaXMuX2N1cnJlbnRUaW1lID0gMC4wO1xuICAgICAgICB0aGlzLl9zZWVrRnJvbVRpbWUgPSAwLjA7XG5cbiAgICAgICAgdGhpcy5fdmlkZW8gPSB2aWRlbztcblxuICAgICAgICB0aGlzLl9vblBsYXllclBvc2l0aW9uQ2hhbmdlZCA9IHRoaXMuX29uUGxheWVyUG9zaXRpb25DaGFuZ2VkLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuX29uU3RhcnQgPSB0aGlzLl9vblN0YXJ0LmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuX29uU2Vla2VkID0gdGhpcy5fb25TZWVrZWQuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5fb25TZWVraW5nID0gdGhpcy5fb25TZWVraW5nLmJpbmQodGhpcyk7XG5cbiAgICAgICAgaWYgKHRoaXMuX3BpbmdTZXJ2ZXIpIHtcbiAgICAgICAgICAgIHRoaXMuX3ZpZGVvLmFkZEV2ZW50TGlzdGVuZXIoJ3RpbWV1cGRhdGUnLCB0aGlzLl9vblBsYXllclBvc2l0aW9uQ2hhbmdlZCk7XG4gICAgICAgICAgICB0aGlzLl92aWRlby5hZGRFdmVudExpc3RlbmVyKCdwbGF5aW5nJywgdGhpcy5fb25TdGFydCk7XG4gICAgICAgICAgICB0aGlzLl92aWRlby5hZGRFdmVudExpc3RlbmVyKCdzZWVrZWQnLCB0aGlzLl9vblNlZWtlZCk7XG4gICAgICAgICAgICB0aGlzLl92aWRlby5hZGRFdmVudExpc3RlbmVyKCdzZWVraW5nJywgdGhpcy5fb25TZWVraW5nKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgX2NyZWF0ZVF1ZXJ5U3RyaW5nKGV2ZW50OiBzdHJpbmcsIGN1cnJlbnRQb3NpdGlvbjogbnVtYmVyLCBmcm9tUG9zaXRpb24/OiBudW1iZXIpIHtcbiAgICAgICAgY29uc3QgVkVSU0lPTiA9IDM7XG5cbiAgICAgICAgaWYgKGV2ZW50KSB7XG4gICAgICAgICAgICBsZXQgc3RyID0gYHY9JHtWRVJTSU9OfSZldj0ke2V2ZW50fSZwdD0ke2N1cnJlbnRQb3NpdGlvbn1gO1xuXG4gICAgICAgICAgICBpZiAoZnJvbVBvc2l0aW9uKSB7XG4gICAgICAgICAgICAgICAgc3RyICs9IGAmZnQ9JHtmcm9tUG9zaXRpb259YDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHN0cjtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBgdj0ke1ZFUlNJT059JnB0PSR7Y3VycmVudFBvc2l0aW9ufWA7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25TdGFydCgpIHtcbiAgICAgICAgaWYgKHRoaXMuX3BpbmdTZXJ2ZXIgJiYgIXRoaXMuX3NlbnRTdGFydFBpbmcpIHtcbiAgICAgICAgICAgIHRoaXMuX3NlbmRQaW5nKHRoaXMuU1RBUlQsIDApO1xuICAgICAgICAgICAgdGhpcy5fc2VudFN0YXJ0UGluZyA9IHRydWU7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIF9vblNlZWtpbmcoKSB7XG4gICAgICAgIHRoaXMuX3NlZWtpbmcgPSB0cnVlO1xuICAgICAgICB0aGlzLl9uZXh0VGltZSA9IHVuZGVmaW5lZDtcbiAgICAgICAgdGhpcy5fc2Vla0Zyb21UaW1lID0gdGhpcy5fY3VycmVudFRpbWU7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25TZWVrZWQoKSB7XG4gICAgICAgIGlmICh0aGlzLl9waW5nU2VydmVyICYmIHRoaXMuX3NlZWtpbmcgJiYgdGhpcy5fc2Vla0Zyb21UaW1lKSB7XG4gICAgICAgICAgICB0aGlzLl9zZW5kUGluZyh0aGlzLlNFRUssIHRoaXMuX2N1cnJlbnRUaW1lLCB0aGlzLl9zZWVrRnJvbVRpbWUpO1xuICAgICAgICAgICAgdGhpcy5fc2Vla2luZyA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5fc2Vla0Zyb21UaW1lID0gdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25QbGF5ZXJQb3NpdGlvbkNoYW5nZWQoKSB7XG4gICAgICAgIHRoaXMuX2N1cnJlbnRUaW1lID0gdGhpcy5fdmlkZW8uY3VycmVudFRpbWU7XG5cbiAgICAgICAgaWYgKHRoaXMuX3BpbmdTZXJ2ZXIgJiYgIXRoaXMuX3NlZWtpbmcgJiYgdGhpcy5fbmV4dFRpbWUgJiYgdGhpcy5fY3VycmVudFRpbWUgPiB0aGlzLl9uZXh0VGltZSkge1xuICAgICAgICAgICAgdGhpcy5fbmV4dFRpbWUgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICB0aGlzLl9zZW5kUGluZyhudWxsLCB0aGlzLl9jdXJyZW50VGltZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIF9zZW5kUGluZyhldmVudDogc3RyaW5nLCBjdXJyZW50UG9zaXRpb246IG51bWJlciwgZnJvbVBvc2l0aW9uPzogbnVtYmVyKSB7XG4gICAgICAgIGxldCB1cmwgPSBgJHt0aGlzLl9wcm90b2NvbH0vLyR7dGhpcy5fZG9tYWlufS9zZXNzaW9uL3BpbmcvJHt0aGlzLl9zZXNzaW9uSWR9Lmpzb24/JHt0aGlzLl9jcmVhdGVRdWVyeVN0cmluZyhldmVudCwgY3VycmVudFBvc2l0aW9uLCBmcm9tUG9zaXRpb24pfWA7XG5cbiAgICAgICAgdmFyIHhociA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xuICAgICAgICB4aHIub3BlbihcIkdFVFwiLCB1cmwsIHRydWUpO1xuICAgICAgICB4aHIucmVzcG9uc2VUeXBlID0gXCJ0ZXh0XCI7XG5cbiAgICAgICAgeGhyLm9ubG9hZCA9ICgpID0+IHtcbiAgICAgICAgICAgIGlmICh4aHIuc3RhdHVzID09PSAyMDApIHtcbiAgICAgICAgICAgICAgICBsZXQganNvbiA9IEpTT04ucGFyc2UoeGhyLnJlc3BvbnNlVGV4dCk7XG4gICAgICAgICAgICAgICAgdGhpcy5fbmV4dFRpbWUgPSBqc29uLm5leHRfdGltZTtcblxuICAgICAgICAgICAgICAgIC8vYWJzZW5jZSBvZiBlcnJvciBwcm9wZXJ0eSBpbmRpY2F0ZXMgbm8gZXJyb3JcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5fbmV4dFRpbWUgPCAwIHx8IGpzb24uaGFzT3duUHJvcGVydHkoJ2Vycm9yJykpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fcGluZ1NlcnZlciA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9uZXh0VGltZSA9IHVuZGVmaW5lZDtcblxuICAgICAgICAgICAgICAgICAgICB0aGlzLl92aWRlby5yZW1vdmVFdmVudExpc3RlbmVyKCd0aW1ldXBkYXRlJywgdGhpcy5fb25QbGF5ZXJQb3NpdGlvbkNoYW5nZWQpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl92aWRlby5yZW1vdmVFdmVudExpc3RlbmVyKCdwbGF5aW5nJywgdGhpcy5fb25TdGFydCk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3ZpZGVvLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3NlZWtlZCcsIHRoaXMuX29uU2Vla2VkKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fdmlkZW8ucmVtb3ZlRXZlbnRMaXN0ZW5lcignc2Vla2luZycsIHRoaXMuX29uU2Vla2luZyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIHhoci5zZW5kKCk7XG4gICAgfVxufSJdfQ==
