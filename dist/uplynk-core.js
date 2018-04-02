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
        _this._licenseManager = null;
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
    AdaptivePlayer.prototype._startLicenseRequest = function (drmInfo, ksUrl) {
        if (!this._licenseManager) {
            this._licenseManager = new license_manager_1.LicenseManager(this._video, this._adaptiveSource);
        }
        this._licenseManager.setKeyServerPrefix(ksUrl);
        this._licenseManager.addLicenseRequest(drmInfo);
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
            return '02.00.18032700';
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
        this._keyRequests = [];
        this._pendingKeyRequests = [];
        this.initMediaKeys();
    }
    LicenseManager.prototype.addLicenseRequest = function (drmInfo) {
        for (var i = 0; i < this._keyRequests.length; i++) {
            if (drmInfo.widevine === this._keyRequests[i].widevine) {
                return;
            }
        }
        for (var i = 0; i < this._pendingKeyRequests.length; i++) {
            if (drmInfo.widevine === this._pendingKeyRequests[i].widevine) {
                return;
            }
        }
        this._pendingKeyRequests.push(drmInfo);
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
                keySystemAccess.createMediaKeys()
                    .then(function (createdMediaKeys) {
                    self.onMediaKeyAcquired(self, createdMediaKeys);
                });
            }, function () {
                navigator.requestMediaKeySystemAccess(self.playreadyKeySystem.keySystem, self.playreadyKeySystem.supportedConfig)
                    .then(function (keySystemAccess) {
                    self._licenseType = self.LICENSE_TYPE_PLAYREADY;
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
            var drmItem = self._pendingKeyRequests.shift();
            this._keyRequests.push(drmItem);
            console.log("LicenseManager - starting license update for DRM playback");
            if (self._licenseType === this.LICENSE_TYPE_WIDEVINE) {
                self.getNewKeySession(utils.base64ToBuffer(drmItem.widevine));
            }
            else if (self._licenseType === this.LICENSE_TYPE_PLAYREADY) {
                self.getNewKeySession(utils.base64ToBuffer(drmItem.playready));
            }
        }
    };
    LicenseManager.prototype.getNewKeySession = function (initData) {
        var self = this;
        var keySession = self._mediaKeys.createSession("temporary");
        keySession.addEventListener('message', function (event) {
            self.downloadNewKey(self.getLicenseUrl(), event.message, function (data) {
                var prom = event.target.update(data);
                prom.catch(function (e) {
                    self._adaptiveSource.signalDrmError('LicenseManager - call to MediaKeySession.update() failed: ' + e);
                });
                console.log("LicenseManager - finished license update for DRM playback");
            });
        }, false);
        var reqPromise = keySession.generateRequest('cenc', initData);
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
        xhr.withCredentials = false;
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
            return '02.00.18032700';
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvdHMvYWQvYWQtYnJlYWsudHMiLCJzcmMvdHMvYWRhcHRpdmUtcGxheWVyLnRzIiwic3JjL3RzL2V2ZW50cy50cyIsInNyYy90cy9pZDMvaWQzLWRlY29kZXIudHMiLCJzcmMvdHMvaWQzL2lkMy1oYW5kbGVyLnRzIiwic3JjL3RzL2xpY2Vuc2UtbWFuYWdlci1mcC50cyIsInNyYy90cy9saWNlbnNlLW1hbmFnZXIudHMiLCJzcmMvdHMvbmF0aXZlLXBsYXllci50cyIsInNyYy90cy9wb2x5ZmlsbC9hcnJheS50cyIsInNyYy90cy9wb2x5ZmlsbC9vYmplY3QudHMiLCJzcmMvdHMvcG9seWZpbGwvdnR0LWN1ZS50cyIsInNyYy90cy91cGx5bmstY29yZS50cyIsInNyYy90cy91dGlscy9vYnNlcnZhYmxlLnRzIiwic3JjL3RzL3V0aWxzL3NlZ21lbnQtbWFwLnRzIiwic3JjL3RzL3V0aWxzL3N0cmluZy1tYXAudHMiLCJzcmMvdHMvdXRpbHMvdGh1bWJuYWlsLWhlbHBlci50cyIsInNyYy90cy91dGlscy91dGlscy50cyIsInNyYy90cy93ZWItc2VydmljZXMvYXNzZXQtaW5mby1zZXJ2aWNlLnRzIiwic3JjL3RzL3dlYi1zZXJ2aWNlcy9waW5nLXNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztBQ0FBO0lBT0ksaUJBQVksUUFBbUI7UUFDM0IsSUFBSSxRQUFRLElBQUksUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7WUFDakMsSUFBSSxDQUFDLFNBQVMsR0FBRyxRQUFRLENBQUM7WUFDMUIsSUFBSSxDQUFDLE1BQU0sR0FBRyxRQUFRLENBQUMsTUFBTSxDQUFDO1lBQzlCLElBQUksQ0FBQyxTQUFTLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztZQUN2QyxJQUFJLENBQUMsT0FBTyxHQUFHLFFBQVEsQ0FBQyxRQUFR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UUFFcEIsSUFBSSxDQUFDLFdBQVcsR0FBRyxTQUFTLElBQUksSUFBSSxJQUFJLFNBQVMsSUFBSSxFQUFFLENBQUM7UUFDeEQsSUFBSSxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUM7UUFFM0IsSUFBSSxDQUFDLGNBQWMsR0FBRyxLQUFLLENBQUM7UUFDNUIsSUFBSSxDQUFDLFFBQVEsR0FBRyxLQUFLLENBQUM7UUFFdEIsSUFBSSxDQUFDLFlBQVksR0FBRyxHQUFHLENBQUM7UUFDeEIsSUFBSSxDQUFDLGFBQWEsR0FBRyxHQUFHLENBQUM7UUFFekIsSUFBSSxDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUM7UUFFcEIsSUFBSSxDQUFDLHdCQUF3QixHQUFHLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDekUsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN6QyxJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzNDLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFN0MsSUFBSSxJQUFJLENBQUMsV0FBVyxFQUFFO1lBQ2xCLElBQUksQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsWUFBWSxFQUFFLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO1lBQzFFLElBQUksQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUN2RCxJQUFJLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDdkQsSUFBSSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1NBQzVE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cEQsS0FBSSxDQUFDLFdBQVcsR0FBRyxLQUFLLENBQUM7b0JBQ3pCLEtBQUksQ0FBQyxTQUFTLEdBQUcsU0FBUyxDQUFDO29CQUUzQixLQUFJLENBQUMsTUFBTSxDQUFDLG1CQUFtQixDQUFDLFlBQVksRUFBRSxLQUFJLENBQUMsd0JBQXdCLENBQUMsQ0FBQztvQkFDN0UsS0FBSSxDQUFDLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxTQUFTLEVBQUUsS0FBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO29CQUMxRCxLQUFJLENBQUMsTUFBTSxDQUFDLG1CQUFtQixDQUFDLFFBQVEsRUFBRSxLQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7b0JBQzFELEtBQUksQ0FBQyxNQUFNLENBQUMsbUJBQW1CLENBQUMsU0FBUyxFQUFFLEtBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztpQkFDL0Q7YUFDSjtRQUNMLENBQUMsQ0FBQztRQUVGLEdBQUcsQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUNmLENBQUM7SUFDTCxrQkFBQztBQUFELENBekhBLEFBeUhDLElBQUE7QUF6SFksa0NBQVciLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbigpe2Z1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfXJldHVybiBlfSkoKSIsImV4cG9ydCBjbGFzcyBBZEJyZWFrIHtcbiAgICByZWFkb25seSBzdGFydFRpbWU6IG51bWJlcjtcbiAgICByZWFkb25seSBlbmRUaW1lOiBudW1iZXI7XG4gICAgcmVhZG9ubHkgZHVyYXRpb246IG51bWJlcjtcbiAgICByZWFkb25seSBudW1BZHM6IG51bWJlcjtcbiAgICBwcml2YXRlIF9zZWdtZW50czogU2VnbWVudFtdO1xuXG4gICAgY29uc3RydWN0b3Ioc2VnbWVudHM6IFNlZ21lbnRbXSkge1xuICAgICAgICBpZiAoc2VnbWVudHMgJiYgc2VnbWVudHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgdGhpcy5fc2VnbWVudHMgPSBzZWdtZW50cztcbiAgICAgICAgICAgIHRoaXMubnVtQWRzID0gc2VnbWVudHMubGVuZ3RoO1xuICAgICAgICAgICAgdGhpcy5zdGFydFRpbWUgPSBzZWdtZW50c1swXS5zdGFydFRpbWU7XG4gICAgICAgICAgICB0aGlzLmVuZFRpbWUgPSBzZWdtZW50c1tzZWdtZW50cy5sZW5ndGggLSAxXS5lbmRUaW1lO1xuICAgICAgICAgICAgdGhpcy5kdXJhdGlvbiA9IHRoaXMuZW5kVGltZSAtIHRoaXMuc3RhcnRUaW1lO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0QWRQb3NpdGlvbkF0KHRpbWU6IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fc2VnbWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGlmICh0aGlzLl9zZWdtZW50c1tpXS5zdGFydFRpbWUgPD0gdGltZSAmJiB0aW1lIDw9IHRoaXMuX3NlZ21lbnRzW2ldLmVuZFRpbWUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gaSArIDE7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gMDtcbiAgICB9XG5cbiAgICBnZXRTZWdtZW50QXQoaW5kZXg6IG51bWJlcik6IFNlZ21lbnQge1xuICAgICAgICBpZih0aGlzLl9zZWdtZW50cyAmJiBpbmRleCA+IC0xICYmIGluZGV4IDwgdGhpcy5fc2VnbWVudHMubGVuZ3RoKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fc2VnbWVudHNbaW5kZXhdO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICBjb250YWlucyh0aW1lOiBudW1iZXIpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc3RhcnRUaW1lIDw9IHRpbWUgJiYgdGltZSA8PSB0aGlzLmVuZFRpbWU7XG4gICAgfVxufSIsImltcG9ydCB7IE9ic2VydmFibGUgfSBmcm9tICcuL3V0aWxzL29ic2VydmFibGUnO1xuaW1wb3J0IHsgQXNzZXRJbmZvLCBBc3NldEluZm9TZXJ2aWNlIH0gZnJvbSAnLi93ZWItc2VydmljZXMvYXNzZXQtaW5mby1zZXJ2aWNlJztcbmltcG9ydCB7IFBpbmdTZXJ2aWNlIH0gZnJvbSAnLi93ZWItc2VydmljZXMvcGluZy1zZXJ2aWNlJztcbmltcG9ydCB7IElEM0hhbmRsZXIsIElEM1RhZ0V2ZW50LCBUeHh4SUQzRnJhbWVFdmVudCwgUHJpdklEM0ZyYW1lRXZlbnQsIFRleHRJRDNGcmFtZUV2ZW50LCBTbGljZUV2ZW50IH0gZnJvbSAnLi9pZDMvaWQzLWhhbmRsZXInO1xuaW1wb3J0IHsgSUQzRGF0YSB9IGZyb20gJy4vaWQzL2lkMy1kYXRhJztcbmltcG9ydCB7IFNlZ21lbnRNYXAgfSBmcm9tICcuL3V0aWxzL3NlZ21lbnQtbWFwJztcbmltcG9ydCAqIGFzIHRodW1iIGZyb20gJy4vdXRpbHMvdGh1bWJuYWlsLWhlbHBlcic7XG5pbXBvcnQgeyBBZEJyZWFrIH0gZnJvbSAnLi9hZC9hZC1icmVhayc7XG5pbXBvcnQgeyBFdmVudHMgfSBmcm9tICcuL2V2ZW50cyc7XG5pbXBvcnQgeyBQbGF5ZXIsIFJlc29sdXRpb24sIE1pbWVUeXBlIH0gZnJvbSAnLi9wbGF5ZXInO1xuaW1wb3J0IHsgaXNMb2NhbFN0b3JhZ2VBdmFpbGFibGUgfSBmcm9tICcuL3V0aWxzL3V0aWxzJztcbmltcG9ydCB7IExpY2Vuc2VNYW5hZ2VyIH0gZnJvbSAnLi9saWNlbnNlLW1hbmFnZXInO1xuaW1wb3J0IHsgYmFzZTY0VG9CdWZmZXIsIGdldFByb3RvY29sLCBpc0lFMTFPckVkZ2UgfSBmcm9tICcuL3V0aWxzL3V0aWxzJztcblxuZXhwb3J0IGNsYXNzIEFkYXB0aXZlUGxheWVyIGV4dGVuZHMgT2JzZXJ2YWJsZSBpbXBsZW1lbnRzIFBsYXllciB7XG4gICAgcHJpdmF0ZSBfdmlkZW86IEhUTUxWaWRlb0VsZW1lbnQ7XG4gICAgcHJpdmF0ZSBfYWRhcHRpdmVTb3VyY2U6IE1vZHVsZS5BZGFwdGl2ZVNvdXJjZTtcbiAgICBwcml2YXRlIF9tZWRpYVNvdXJjZTogTWVkaWFTb3VyY2U7XG4gICAgcHJpdmF0ZSBfdXJsOiBzdHJpbmc7XG4gICAgcHJpdmF0ZSBfb2JqZWN0VXJsOiBzdHJpbmc7XG4gICAgcHJpdmF0ZSBfYXNzZXRJbmZvU2VydmljZTogQXNzZXRJbmZvU2VydmljZTtcbiAgICBwcml2YXRlIF9waW5nU2VydmljZTogUGluZ1NlcnZpY2U7XG4gICAgcHJpdmF0ZSBfaWQzSGFuZGxlcjogSUQzSGFuZGxlcjtcbiAgICBwcml2YXRlIF9zZWdtZW50TWFwOiBTZWdtZW50TWFwO1xuICAgIHByaXZhdGUgX2NvbmZpZzogUGxheWVyT3B0aW9ucztcbiAgICBwcml2YXRlIF9maXJlZFJlYWR5RXZlbnQ6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSBfaXNTYWZhcmk6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSBfaXNGaXJlZm94OiBib29sZWFuO1xuICAgIHByaXZhdGUgX2lzQ2hyb21lOiBib29sZWFuO1xuICAgIHByaXZhdGUgX2lzSUU6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSBfaXNQYXVzZWQ6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSBfdGFyZ2V0VGltZTogbnVtYmVyO1xuICAgIHByaXZhdGUgX2ZvcmNlZEFkQnJlYWs6IEFkQnJlYWs7XG4gICAgcHJpdmF0ZSBfdmlkZW9SZWN0OiBDbGllbnRSZWN0O1xuICAgIHByaXZhdGUgX2VuZGVkOiBib29sZWFuO1xuICAgIHByaXZhdGUgX3VzaW5nQ3VzdG9tVUk6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSBfaW50ZXJ2YWxJZDogbnVtYmVyO1xuICAgIHByaXZhdGUgX2xpY2Vuc2VNYW5hZ2VyOiBMaWNlbnNlTWFuYWdlcjtcbiAgICBwcml2YXRlIF9wcm90b2NvbDogc3RyaW5nO1xuXG4gICAgcHJpdmF0ZSByZWFkb25seSBfZGVmYXVsdHM6IFBsYXllck9wdGlvbnMgPSB7XG4gICAgICAgIGRpc2FibGVTZWVrRHVyaW5nQWRCcmVhazogdHJ1ZSxcbiAgICAgICAgc2hvd1Bvc3RlcjogZmFsc2UsXG4gICAgICAgIGRlYnVnOiBmYWxzZSxcbiAgICAgICAgbGltaXRSZXNvbHV0aW9uVG9WaWV3U2l6ZTogZmFsc2UsXG4gICAgfTtcblxuICAgIGNvbnN0cnVjdG9yKHZpZGVvOiBIVE1MVmlkZW9FbGVtZW50LCBvcHRpb25zPzogUGxheWVyT3B0aW9ucykge1xuICAgICAgICBzdXBlcigpO1xuXG4gICAgICAgIC8vaW5pdCBjb25maWdcbiAgICAgICAgdmFyIGRhdGEgPSB7fTtcblxuICAgICAgICAvL3RyeSBwYXJzaW5nIGRhdGEgYXR0cmlidXRlIGNvbmZpZ1xuICAgICAgICB0cnkgeyBkYXRhID0gSlNPTi5wYXJzZSh2aWRlby5nZXRBdHRyaWJ1dGUoJ2RhdGEtY29uZmlnJykpOyB9XG4gICAgICAgIGNhdGNoIChlKSB7IH1cblxuICAgICAgICAvL21lcmdlIGRlZmF1bHRzIHdpdGggdXNlciBvcHRpb25zXG4gICAgICAgIHRoaXMuX2NvbmZpZyA9IE9iamVjdC5hc3NpZ24oe30sIHRoaXMuX2RlZmF1bHRzLCBvcHRpb25zLCBkYXRhKTtcblxuICAgICAgICB0aGlzLl92aWRlbyA9IHZpZGVvO1xuICAgICAgICB0aGlzLl9pZDNIYW5kbGVyID0gbmV3IElEM0hhbmRsZXIodmlkZW8pO1xuICAgICAgICB0aGlzLl9pZDNIYW5kbGVyLm9uKElEM0hhbmRsZXIuRXZlbnQuSUQzVGFnLCB0aGlzLl9vbklEM1RhZy5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5faWQzSGFuZGxlci5vbihJRDNIYW5kbGVyLkV2ZW50LlR4eHhJRDNGcmFtZSwgdGhpcy5fb25UeHh4SUQzRnJhbWUuYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuX2lkM0hhbmRsZXIub24oSUQzSGFuZGxlci5FdmVudC5Qcml2SUQzRnJhbWUsIHRoaXMuX29uUHJpdklEM0ZyYW1lLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLl9pZDNIYW5kbGVyLm9uKElEM0hhbmRsZXIuRXZlbnQuVGV4dElEM0ZyYW1lLCB0aGlzLl9vblRleHRJRDNGcmFtZS5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5faWQzSGFuZGxlci5vbihJRDNIYW5kbGVyLkV2ZW50LlNsaWNlRW50ZXJlZCwgdGhpcy5fb25TbGljZUVudGVyZWQuYmluZCh0aGlzKSk7XG5cbiAgICAgICAgdGhpcy5fb25WaWRlb1RpbWVVcGRhdGUgPSB0aGlzLl9vblZpZGVvVGltZVVwZGF0ZS5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLl9vblZpZGVvU2Vla2luZyA9IHRoaXMuX29uVmlkZW9TZWVraW5nLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuX29uVmlkZW9TZWVrZWQgPSB0aGlzLl9vblZpZGVvU2Vla2VkLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuX29uTWVkaWFTb3VyY2VPcGVuID0gdGhpcy5fb25NZWRpYVNvdXJjZU9wZW4uYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5fb25WaWRlb1BsYXliYWNrRW5kID0gdGhpcy5fb25WaWRlb1BsYXliYWNrRW5kLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuX29uVGltZXJUaWNrID0gdGhpcy5fb25UaW1lclRpY2suYmluZCh0aGlzKTtcblxuICAgICAgICB0aGlzLl9pc1NhZmFyaSA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9pc0lFID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2lzRmlyZWZveCA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9pc0Nocm9tZSA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9maXJlZFJlYWR5RXZlbnQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fZW5kZWQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fdXNpbmdDdXN0b21VSSA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9pbnRlcnZhbElkID0gMDtcbiAgICAgICAgdGhpcy5fbGljZW5zZU1hbmFnZXIgPSBudWxsO1xuXG4gICAgICAgIHRoaXMuX292ZXJyaWRlQ3VycmVudFRpbWUoKTtcbiAgICAgICAgdGhpcy5fb3ZlcnJpZGVFbmRlZCgpO1xuICAgIH1cblxuICAgIHByaXZhdGUgX292ZXJyaWRlQ3VycmVudFRpbWUoKTogdm9pZCB7XG4gICAgICAgIC8vb3ZlcnJpZGUgJ2N1cnJlbnRUaW1lJyBwcm9wZXJ0eSBzbyB3ZSBjYW4gcHJldmVudCB1c2VycyBmcm9tIHNldHRpbmcgdmlkZW8uY3VycmVudFRpbWUsIGFsbG93aW5nIHRoZW1cbiAgICAgICAgLy8gdG8gc2tpcCBhZHMuXG4gICAgICAgIHZhciBjdXJyZW50VGltZVByb3BlcnR5ID0gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcihIVE1MTWVkaWFFbGVtZW50LnByb3RvdHlwZSwgJ2N1cnJlbnRUaW1lJyk7XG4gICAgICAgIGlmIChjdXJyZW50VGltZVByb3BlcnR5KSB7XG5cbiAgICAgICAgICAgIHZhciBnZXRDdXJyZW50VGltZSA9IGN1cnJlbnRUaW1lUHJvcGVydHkuZ2V0O1xuICAgICAgICAgICAgdmFyIHNldEN1cnJlbnRUaW1lID0gY3VycmVudFRpbWVQcm9wZXJ0eS5zZXQ7XG5cbiAgICAgICAgICAgIGxldCBzZWxmID0gdGhpcztcblxuICAgICAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMuX3ZpZGVvLCAnY3VycmVudFRpbWUnLCB7XG4gICAgICAgICAgICAgICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBnZXRDdXJyZW50VGltZS5hcHBseSh0aGlzKTtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHNldDogZnVuY3Rpb24gKHZhbDogbnVtYmVyKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChzZWxmLmNhblNlZWsoKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5fZW5kZWQgPSBmYWxzZTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gcGFyc2VGbG9hdCg8YW55PnZhbCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBhY3R1YWxUaW1lID0gc2VsZi5nZXRTZWVrVGltZSh2YWwpO1xuICAgICAgICAgICAgICAgICAgICAgICAgc2V0Q3VycmVudFRpbWUuYXBwbHkodGhpcywgW2FjdHVhbFRpbWVdKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy9jYWxsIHNlZWsgcmlnaHQgYXdheSBpbnN0ZWFkIG9mIHdhaXRpbmcgZm9yICdzZWVraW5nJyBldmVudFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gc28gcGxheWVyIGRvZXNuJ3QgaGF2ZSB0aW1lIHRvIGRvd25zaGlmdCB0aGlua2luZyBpdCBoYXNcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIG5vIGRhdGEgYXQgdGhlIGN1cnJlbnRUaW1lIHBvc2l0aW9uIChVUC02MDEwKS5cbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYuX2FkYXB0aXZlU291cmNlLnNlZWsoYWN0dWFsVGltZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIGVudW1lcmFibGU6IGZhbHNlLFxuICAgICAgICAgICAgICAgIGNvbmZpZ3VyYWJsZTogZmFsc2UsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgX292ZXJyaWRlRW5kZWQoKTogdm9pZCB7XG4gICAgICAgIC8vb3ZlcnJpZGUgZW5kZWQgcHJvcGVydHkgc28gd2UgY2FuIG1ha2UgaXQgbm90IHJlYWQtb25seS4gYWxsb3dpbmcgdXMgdG8gZmlyZSB0aGUgJ2VuZGVkJ1xuICAgICAgICAvLyBldmVudCBhbmQgaGF2ZSB0aGUgdWkgcmVzcG9uZCBjb3JyZWN0bHlcbiAgICAgICAgbGV0IHNlbGYgPSB0aGlzO1xuXG4gICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0aGlzLl92aWRlbywgJ2VuZGVkJywge1xuICAgICAgICAgICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNlbGYuX2VuZGVkO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGVudW1lcmFibGU6IGZhbHNlLFxuICAgICAgICAgICAgY29uZmlndXJhYmxlOiBmYWxzZSxcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgc3RhdGljIGdldCBFdmVudCgpIHtcbiAgICAgICAgcmV0dXJuIEV2ZW50cztcbiAgICB9XG5cbiAgICBkZXN0cm95KCk6IHZvaWQge1xuICAgICAgICB0aGlzLl9zdG9wTWFpbkxvb3AoKTtcblxuICAgICAgICBpZiAodHlwZW9mIHRoaXMuX2FkYXB0aXZlU291cmNlICE9ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5kZWxldGUoKTtcbiAgICAgICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlID0gdW5kZWZpbmVkO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuX29iamVjdFVybCkge1xuICAgICAgICAgICAgd2luZG93LlVSTC5yZXZva2VPYmplY3RVUkwodGhpcy5fb2JqZWN0VXJsKTtcbiAgICAgICAgICAgIHRoaXMuX29iamVjdFVybCA9IG51bGw7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBsb2FkKGluZm86IHN0cmluZyB8IExvYWRDb25maWcpOiB2b2lkIHtcbiAgICAgICAgbGV0IHVybDogc3RyaW5nO1xuICAgICAgICBpZiAodHlwZW9mIGluZm8gPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIHVybCA9IGluZm8gYXMgc3RyaW5nO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdXJsID0gKGluZm8gYXMgTG9hZENvbmZpZykudXJsO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fcHJvdG9jb2wgPSBnZXRQcm90b2NvbCh1cmwpO1xuICAgICAgICAvL0lFMTEgYW5kIEVkZ2UgZG9uJ3QgcmVkaXJlY3QgJ2h0dHA6JyB0byAnaHR0cHM6JyBhZnRlciBIU1RTIGhlYWRlcnMgYXJlIHJldHVybmVkXG4gICAgICAgIC8vIGZyb20gdGhlIGZpcnN0ICdodHRwczonIHJlcXVlc3QuICBJbnN0ZWFkLCBhIDUwMCBlcnJvciBpcyByZXR1cm5lZC4gIFNvIGp1c3QgZm9yY2VcbiAgICAgICAgLy8gJ2h0dHBzOicgZnJvbSB0aGUgZ2V0IGdvIGFuZCB3ZSBjYW4gYXZvaWQgdGhvc2UgaXNzdWVzLlxuICAgICAgICBpZiAoaXNJRTExT3JFZGdlKCkgJiYgdGhpcy5fcHJvdG9jb2wgPT09ICdodHRwOicgJiYgdGhpcy5faXNVcGx5bmtVcmwodXJsKSkge1xuICAgICAgICAgICAgdGhpcy5fcHJvdG9jb2wgPSAnaHR0cHM6JztcbiAgICAgICAgICAgIHVybCA9ICdodHRwczonICsgdXJsLnN1YnN0cig1KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX2ZpcmVkUmVhZHlFdmVudCA9IGZhbHNlO1xuICAgICAgICB0aGlzLl91cmwgPSB1cmw7XG4gICAgICAgIHRoaXMuX3RhcmdldFRpbWUgPSB1bmRlZmluZWQ7XG4gICAgICAgIHRoaXMuX2ZvcmNlZEFkQnJlYWsgPSB1bmRlZmluZWQ7XG4gICAgICAgIHRoaXMuX2VuZGVkID0gZmFsc2U7XG5cbiAgICAgICAgdGhpcy5fbWVkaWFTb3VyY2UgPSBuZXcgTWVkaWFTb3VyY2UoKTtcbiAgICAgICAgaWYgKHR5cGVvZiB0aGlzLl9hZGFwdGl2ZVNvdXJjZSAhPSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2UuZGVsZXRlKCk7XG4gICAgICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZSA9IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX3ZpZGVvLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3RpbWV1cGRhdGUnLCB0aGlzLl9vblZpZGVvVGltZVVwZGF0ZSk7XG4gICAgICAgIHRoaXMuX3ZpZGVvLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3NlZWtpbmcnLCB0aGlzLl9vblZpZGVvU2Vla2luZyk7XG4gICAgICAgIHRoaXMuX3ZpZGVvLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3NlZWtlZCcsIHRoaXMuX29uVmlkZW9TZWVrZWQpO1xuICAgICAgICB0aGlzLl92aWRlby5yZW1vdmVFdmVudExpc3RlbmVyKCdlbmRlZCcsIHRoaXMuX29uVmlkZW9QbGF5YmFja0VuZCk7XG5cbiAgICAgICAgdGhpcy5fdmlkZW8uYWRkRXZlbnRMaXN0ZW5lcigndGltZXVwZGF0ZScsIHRoaXMuX29uVmlkZW9UaW1lVXBkYXRlKTtcbiAgICAgICAgdGhpcy5fdmlkZW8uYWRkRXZlbnRMaXN0ZW5lcignc2Vla2luZycsIHRoaXMuX29uVmlkZW9TZWVraW5nKTtcbiAgICAgICAgdGhpcy5fdmlkZW8uYWRkRXZlbnRMaXN0ZW5lcignc2Vla2VkJywgdGhpcy5fb25WaWRlb1NlZWtlZCk7XG4gICAgICAgIHRoaXMuX3ZpZGVvLmFkZEV2ZW50TGlzdGVuZXIoJ2VuZGVkJywgdGhpcy5fb25WaWRlb1BsYXliYWNrRW5kKTtcbiAgICAgICAgLy8gdmlkZW8ub25sb2FkZWRtZXRhZGF0YSBpcyB0aGUgZmlyc3QgdGltZSB0aGUgdmlkZW8gd2lkdGgvaGVpZ2h0IGlzIGF2YWlsYWJsZVxuICAgICAgICB0aGlzLl92aWRlby5vbmxvYWRlZG1ldGFkYXRhID0gdGhpcy51cGRhdGVWaWRlb1JlY3QuYmluZCh0aGlzKTtcblxuICAgICAgICB0aGlzLl9tZWRpYVNvdXJjZS5hZGRFdmVudExpc3RlbmVyKCdzb3VyY2VvcGVuJywgdGhpcy5fb25NZWRpYVNvdXJjZU9wZW4pO1xuXG4gICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlID0gbmV3IE1vZHVsZS5BZGFwdGl2ZVNvdXJjZSgpO1xuICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5vbkJlYW1Mb2FkZWQodGhpcy5fb25CZWFtTG9hZGVkLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5vblRyYWNrTG9hZGVkKHRoaXMuX29uVHJhY2tMb2FkZWQuYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlLm9uTG9hZGVkKHRoaXMuX29uU291cmNlTG9hZGVkLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5vbkxvYWRFcnJvcih0aGlzLl9vbkxvYWRFcnJvci5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2Uub25Ecm1FcnJvcih0aGlzLl9vbkRybUVycm9yLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5vblNlZ21lbnRNYXBDaGFuZ2VkKHRoaXMuX29uU2VnbWVudE1hcENoYW5nZWQuYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlLnN0YXJ0TWFpbkxvb3AodGhpcy5fc3RhcnRNYWluTG9vcC5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2Uuc3RvcE1haW5Mb29wKHRoaXMuX3N0b3BNYWluTG9vcC5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2Uuc3RhcnRMaWNlbnNlUmVxdWVzdCh0aGlzLl9zdGFydExpY2Vuc2VSZXF1ZXN0LmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5vbkF1ZGlvVHJhY2tTd2l0Y2hlZCh0aGlzLl9vbkF1ZGlvVHJhY2tTd2l0Y2hlZC5iaW5kKHRoaXMpKTtcblxuICAgICAgICBpZiAoaXNMb2NhbFN0b3JhZ2VBdmFpbGFibGUoKSkge1xuICAgICAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2Uuc2V0TG9hZEFuZFNhdmVCYW5kd2lkdGgodGhpcy5fbG9hZEJhbmR3aWR0aEhpc3RvcnkuYmluZCh0aGlzKSwgdGhpcy5fc2F2ZUJhbmR3aWR0aEhpc3RvcnkuYmluZCh0aGlzKSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5fb2JqZWN0VXJsKSB7XG4gICAgICAgICAgICB3aW5kb3cuVVJMLnJldm9rZU9iamVjdFVSTCh0aGlzLl9vYmplY3RVcmwpO1xuICAgICAgICAgICAgdGhpcy5fb2JqZWN0VXJsID0gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX29iamVjdFVybCA9IHdpbmRvdy5VUkwuY3JlYXRlT2JqZWN0VVJMKHRoaXMuX21lZGlhU291cmNlKTtcbiAgICAgICAgdGhpcy5fdmlkZW8uc3JjID0gdGhpcy5fb2JqZWN0VXJsO1xuICAgICAgICB0aGlzLl92aWRlby5sb2FkKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRGV0ZXJtaW5lcyBpZiB0aGUgcGxheWVyIGNhbiBzZWVrIGdpdmVuIGl0J3MgY3VycmVudCBwb3NpdGlvbiBhbmRcbiAgICAgKiB3aGV0aGVyIG9yIG5vdCBpdCdzIGluIGFuIGFkIGJyZWFrLlxuICAgICAqIEByZXR1cm4ge2Jvb2xlYW59IFRydWUgaWYgdGhlIHBsYXllciBjYW4gc2Vlaywgb3RoZXJ3aXNlIGZhbHNlLlxuICAgICAqL1xuICAgIGNhblNlZWsoKTogYm9vbGVhbiB7XG4gICAgICAgIGlmICh0aGlzLl9hZGFwdGl2ZVNvdXJjZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5wbGF5bGlzdFR5cGUgPT09ICdMSVZFJyB8fCB0aGlzLnBsYXlsaXN0VHlwZSA9PT0gJ0VWRU5UJykge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICAvL2Nhbid0IHByZXZlbnQgYWxsIHNlZWtzICh2aWEgdWkgb3IgY3VycmVudFRpbWUgcHJvcGVydHkpXG4gICAgICAgIC8vIHdpdGhvdXQgdXNpbmcgYSBjdXN0b20gdWkgKFVQLTMyNjkpLlxuICAgICAgICBpZiAoIXRoaXMuX3VzaW5nQ3VzdG9tVUkpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCF0aGlzLl9jb25maWcuZGlzYWJsZVNlZWtEdXJpbmdBZEJyZWFrKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLl9zZWdtZW50TWFwID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiAhdGhpcy5fc2VnbWVudE1hcC5pbkFkQnJlYWsodGhpcy5fdmlkZW8uY3VycmVudFRpbWUpO1xuICAgIH1cblxuICAgIGdldFNlZWtUaW1lKHRhcmdldFRpbWU6IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIGlmICh0aGlzLnBsYXlsaXN0VHlwZSA9PT0gJ0xJVkUnIHx8IHRoaXMucGxheWxpc3RUeXBlID09PSAnRVZFTlQnKSB7XG4gICAgICAgICAgICByZXR1cm4gdGFyZ2V0VGltZTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vYWxsb3cgdXNlcnMgdG8gc2VlayBhdCBhbnkgdGltZVxuICAgICAgICBpZiAoIXRoaXMuX2NvbmZpZy5kaXNhYmxlU2Vla0R1cmluZ0FkQnJlYWspIHtcbiAgICAgICAgICAgIHJldHVybiB0YXJnZXRUaW1lO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCF0aGlzLl91c2luZ0N1c3RvbVVJKSB7XG4gICAgICAgICAgICByZXR1cm4gdGFyZ2V0VGltZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBjdXJyZW50VGltZSA9IHRoaXMuX3ZpZGVvLmN1cnJlbnRUaW1lO1xuXG4gICAgICAgIC8vYXJlIHdlIHNlZWtpbmcgdG8gdGhlIG1pZGRsZSBvZiBhbiBhZD9cbiAgICAgICAgLy9pZiBzbywgc2VlayB0byBiZWdpbm5pbmcgb2YgdGhlIGFkIGFuZCBwbGF5IG9uLlxuICAgICAgICBsZXQgYWRCcmVhayA9IHRoaXMuX3NlZ21lbnRNYXAuZ2V0QWRCcmVhayh0YXJnZXRUaW1lKTtcbiAgICAgICAgaWYgKGFkQnJlYWspIHtcbiAgICAgICAgICAgIHJldHVybiBhZEJyZWFrLnN0YXJ0VGltZTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vYXJlIHdlIHNraXBwaW5nIHBhc3QgYW55IGFkcyBieSBzZWVraW5nP1xuICAgICAgICBsZXQgYWRCcmVha3MgPSB0aGlzLl9zZWdtZW50TWFwLmdldEFkQnJlYWtzQmV0d2VlbihjdXJyZW50VGltZSwgdGFyZ2V0VGltZSk7XG4gICAgICAgIGlmIChhZEJyZWFrcyAmJiBhZEJyZWFrcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAvL3BsYXkgbmVhcmVzdCBhZCBicmVhayB0aGVuIHNraXAgdG8gb3JpZ2luYWwgdGFyZ2V0IHRpbWVcbiAgICAgICAgICAgIHRoaXMuX3RhcmdldFRpbWUgPSB0YXJnZXRUaW1lO1xuICAgICAgICAgICAgdGhpcy5fZm9yY2VkQWRCcmVhayA9IGFkQnJlYWtzW2FkQnJlYWtzLmxlbmd0aCAtIDFdO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2ZvcmNlZEFkQnJlYWsuc3RhcnRUaW1lO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRhcmdldFRpbWU7XG4gICAgfVxuXG4gICAgcHVibGljIHNldEJyb3dzZXIoc2FmYXJpOiBib29sZWFuLCBpZTogYm9vbGVhbiwgY2hyb21lOiBib29sZWFuLCBmaXJlZm94OiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuX2lzU2FmYXJpID0gc2FmYXJpO1xuICAgICAgICB0aGlzLl9pc0lFID0gaWU7XG4gICAgICAgIHRoaXMuX2lzRmlyZWZveCA9IGZpcmVmb3g7XG4gICAgICAgIHRoaXMuX2lzQ2hyb21lID0gY2hyb21lO1xuICAgICAgICB0aGlzLl91c2luZ0N1c3RvbVVJID0gdHJ1ZTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vblZpZGVvVGltZVVwZGF0ZSgpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuX2FkYXB0aXZlU291cmNlICYmIHRoaXMuX3ZpZGVvKSB7XG4gICAgICAgICAgICAvL2lmIHdlIGZvcmNlZCB0aGUgdXNlciB0byB3YXRjaCBhbiBhZCB3aGVuIHRoZXkgdHJpZWQgdG8gc2VlayBwYXN0IGl0LFxuICAgICAgICAgICAgLy8gdGhpcyB3aWxsIHNlZWsgdG8gdGhlIGRlc2lyZWQgcG9zaXRpb24gYWZ0ZXIgdGhlIGFkIGlzIG92ZXJcbiAgICAgICAgICAgIGlmICh0aGlzLl9mb3JjZWRBZEJyZWFrICYmIHRoaXMuX3ZpZGVvLmN1cnJlbnRUaW1lID4gdGhpcy5fZm9yY2VkQWRCcmVhay5lbmRUaW1lKSB7XG4gICAgICAgICAgICAgICAgbGV0IHRhcmdldFRpbWUgPSB0aGlzLl90YXJnZXRUaW1lO1xuICAgICAgICAgICAgICAgIHRoaXMuX3RhcmdldFRpbWUgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgdGhpcy5fZm9yY2VkQWRCcmVhayA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICB0aGlzLl92aWRlby5jdXJyZW50VGltZSA9IHRhcmdldFRpbWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vaWYgdGhlIHVzZXIgY2xpY2tzIG9uIHRoZSB0aW1lbGluZSB3aGVuIHVzaW5nIHRoZSBicm93c2VyJ3MgbmF0aXZlIHVpLFxuICAgICAgICAgICAgLy8gaXQgY2F1c2VzIGEgJ3RpbWV1cGRhdGUnIGV2ZW50IGp1c3QgYmVmb3JlIGEgJ3NlZWsnIGV2ZW50LCBjYXVzaW5nIHRoZVxuICAgICAgICAgICAgLy8gdXBseW5rIHBsYXllciB0byBzZWxlY3QgcmF5IGJ5IGJhbmR3aWR0aC4gdGhlIHJlc3VsdCBvZiB0aGF0IGlzIGRvd25zaGlmdGluZ1xuICAgICAgICAgICAgLy8gdG8gdGhlIGxvd2VzdCByYXkgcmlnaHQgYmVmb3JlIHRoZSBzZWVrLiB0aGF0IHJheSB0eXBpY2FsbHkgaXNuJ3QgbG9hZGVkIHlldFxuICAgICAgICAgICAgLy8gc28gYW4gZXJyb3Igb2NjdXJzIGFuZCB0aGUgc2VlayBmYWlscyBjYXVzaW5nIHBsYXliYWNrIHRvIHN0b3AuXG4gICAgICAgICAgICBpZiAodGhpcy5fYWRhcHRpdmVTb3VyY2UgJiYgdGhpcy5fdmlkZW8gJiYgIXRoaXMuX3ZpZGVvLnNlZWtpbmcpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5vblRpbWVVcGRhdGUoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy9hcmUgd2UgYXQgb3IgbmVhciB0aGUgZW5kIG9mIGEgVk9EIGFzc2V0LiB2aWRlby5jdXJyZW50VGltZSBkb2Vzbid0IGFsd2F5cyBlcXVhbCB2aWRlby5kdXJhdGlvbiB3aGVuIHRoZSBicm93c2VyXG4gICAgICAgICAgICAvLyBzdG9wcyBwbGF5YmFjayBhdCB0aGUgZW5kIG9mIGEgVk9ELlxuICAgICAgICAgICAgaWYgKHRoaXMucGxheWxpc3RUeXBlID09PSAnVk9EJyAmJiAhdGhpcy5fZW5kZWQgJiYgdGhpcy5fdmlkZW8uZHVyYXRpb24gLSB0aGlzLl92aWRlby5jdXJyZW50VGltZSA8PSAwLjI1KSB7XG5cbiAgICAgICAgICAgICAgICB0aGlzLl9lbmRlZCA9IHRydWU7XG5cbiAgICAgICAgICAgICAgICAvL2ZpcmUgdmlkZW8uZW5kZWQgZXZlbnQgbWFudWFsbHlcbiAgICAgICAgICAgICAgICB2YXIgZXZlbnQgPSBuZXcgQ3VzdG9tRXZlbnQoJ2VuZGVkJyk7XG4gICAgICAgICAgICAgICAgdGhpcy5fdmlkZW8uZGlzcGF0Y2hFdmVudChldmVudCk7XG5cbiAgICAgICAgICAgICAgICB0aGlzLl92aWRlby5wYXVzZSgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyB3ZSBjYW4gcmVzcG9uZCB0byB2aWRlbyByZXNpemVzIHF1aWNrbHkgYnkgcnVubmluZyB3aXRoaW4gX29uVmlkZW9UaW1lVXBkYXRlKClcbiAgICAgICAgICAgIHRoaXMudXBkYXRlVmlkZW9SZWN0KCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIF9vblZpZGVvU2Vla2luZygpOiB2b2lkIHtcbiAgICAgICAgLy9QYXVzaW5nIGR1cmluZyBzZWVrIHNlZW1zIHRvIGhlbHAgc2FmYXJpIG91dCB3aGVuIHNlZWtpbmcgYmV5b25kIHRoZVxuICAgICAgICAvL2VuZCBvZiBpdCdzIHZpZGVvIGJ1ZmZlciwgcGVyaGFwcyBJIHdpbGwgZmluZCBhbm90aGVyIHNvbHV0aW9uIGF0IHNvbWVcbiAgICAgICAgLy9wb2ludCwgYnV0IGZvciBub3cgdGhpcyBpcyB3b3JraW5nLlxuICAgICAgICBpZiAodGhpcy5faXNTYWZhcmkgJiYgISh0aGlzLnBsYXlsaXN0VHlwZSA9PSBcIkVWRU5UXCIgfHwgdGhpcy5wbGF5bGlzdFR5cGUgPT0gXCJMSVZFXCIpKSB7XG4gICAgICAgICAgICB0aGlzLl9pc1BhdXNlZCA9IHRoaXMuX3ZpZGVvLnBhdXNlZDtcbiAgICAgICAgICAgIHRoaXMuX3ZpZGVvLnBhdXNlKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIF9vblZpZGVvU2Vla2VkKCk6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy5faXNTYWZhcmkgJiYgIXRoaXMuX2lzUGF1c2VkICYmICEodGhpcy5wbGF5bGlzdFR5cGUgPT0gXCJFVkVOVFwiIHx8IHRoaXMucGxheWxpc3RUeXBlID09IFwiTElWRVwiKSkge1xuICAgICAgICAgICAgdGhpcy5fdmlkZW8ucGxheSgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25WaWRlb1BsYXliYWNrRW5kKCk6IHZvaWQge1xuICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZS52aWRlb1BsYXliYWNrRW5kKCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25NZWRpYVNvdXJjZU9wZW4oKTogdm9pZCB7XG4gICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlLmluaXRpYWxpemVWaWRlb0VsZW1lbnQodGhpcy5fdmlkZW8sIHRoaXMuX21lZGlhU291cmNlLCB0aGlzLl9jb25maWcuZGVidWcpO1xuICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5sb2FkKHRoaXMuX3VybCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25JRDNUYWcoZXZlbnQ6IElEM1RhZ0V2ZW50KTogdm9pZCB7XG4gICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLklEM1RhZywgZXZlbnQpO1xuICAgIH1cblxuICAgIHByaXZhdGUgX29uVHh4eElEM0ZyYW1lKGV2ZW50OiBUeHh4SUQzRnJhbWVFdmVudCk6IHZvaWQge1xuICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5UeHh4SUQzRnJhbWUsIGV2ZW50KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vblByaXZJRDNGcmFtZShldmVudDogUHJpdklEM0ZyYW1lRXZlbnQpOiB2b2lkIHtcbiAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuUHJpdklEM0ZyYW1lLCBldmVudCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25UZXh0SUQzRnJhbWUoZXZlbnQ6IFRleHRJRDNGcmFtZUV2ZW50KTogdm9pZCB7XG4gICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLlRleHRJRDNGcmFtZSwgZXZlbnQpO1xuICAgIH1cblxuICAgIHByaXZhdGUgX29uU2xpY2VFbnRlcmVkKGV2ZW50OiBTbGljZUV2ZW50KTogdm9pZCB7XG4gICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLlNsaWNlRW50ZXJlZCwgZXZlbnQpO1xuICAgIH1cblxuICAgIHByaXZhdGUgX29uQmVhbUxvYWRlZCgpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuX2lzVXBseW5rVXJsKHRoaXMuX2FkYXB0aXZlU291cmNlLmRvbWFpbikpIHtcbiAgICAgICAgICAgIHRoaXMuX2Fzc2V0SW5mb1NlcnZpY2UgPSBuZXcgQXNzZXRJbmZvU2VydmljZSh0aGlzLl9wcm90b2NvbCwgdGhpcy5fYWRhcHRpdmVTb3VyY2UuZG9tYWluLCB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5zZXNzaW9uSWQpO1xuICAgICAgICAgICAgdGhpcy5fcGluZ1NlcnZpY2UgPSBuZXcgUGluZ1NlcnZpY2UodGhpcy5fcHJvdG9jb2wsIHRoaXMuX2FkYXB0aXZlU291cmNlLmRvbWFpbiwgdGhpcy5fYWRhcHRpdmVTb3VyY2Uuc2Vzc2lvbklkLCB0aGlzLl92aWRlbyk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl92aWRlby50ZXh0VHJhY2tzLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIChjaGFuZ2VUcmFja0V2ZW50OiBUcmFja0V2ZW50KSA9PiB7XG4gICAgICAgICAgICB0aGlzLm9uVGV4dFRyYWNrQ2hhbmdlZChjaGFuZ2VUcmFja0V2ZW50KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuQmVhbUxvYWRlZCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25UcmFja0xvYWRlZCgpOiB2b2lkIHtcbiAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuVHJhY2tMb2FkZWQpO1xuXG4gICAgICAgIGlmICghdGhpcy5fZmlyZWRSZWFkeUV2ZW50KSB7XG4gICAgICAgICAgICB0aGlzLl9maXJlZFJlYWR5RXZlbnQgPSB0cnVlO1xuICAgICAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuUmVhZHkpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfc3RhcnRNYWluTG9vcCgpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuX2ludGVydmFsSWQgPT09IDApIHtcbiAgICAgICAgICAgIHRoaXMuX2ludGVydmFsSWQgPSBzZXRJbnRlcnZhbCh0aGlzLl9vblRpbWVyVGljaywgMTUpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfc3RvcE1haW5Mb29wKCk6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy5faW50ZXJ2YWxJZCAhPT0gMCkge1xuICAgICAgICAgICAgY2xlYXJJbnRlcnZhbCh0aGlzLl9pbnRlcnZhbElkKTtcbiAgICAgICAgICAgIHRoaXMuX2ludGVydmFsSWQgPSAwO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25UaW1lclRpY2soKTogdm9pZCB7XG4gICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlLm9uVGljaygpO1xuICAgIH1cblxuICAgIHByaXZhdGUgX2lzVXBseW5rVXJsKHVybDogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgICAgIGNvbnN0IHRlbXAgPSB1cmwudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgcmV0dXJuIHRlbXAuaW5kZXhPZigndXBseW5rLmNvbScpID4gLTEgfHwgdGVtcC5pbmRleE9mKCdkb3dubHluay5jb20nKSA+IC0xO1xuICAgIH1cblxuICAgIHByaXZhdGUgX29uU291cmNlTG9hZGVkKCk6IHZvaWQge1xuICAgICAgICAvL3ByZS1sb2FkIHNlZ21lbnQgbWFwIHNvIGFzc2V0SW5mbyBkYXRhIHdpbGwgYmUgYXZhaWxhYmxlIHdoZW5cbiAgICAgICAgLy8gbmV3IHNlZ21lbnRzIGFyZSBlbmNvdW50ZXJlZC5cbiAgICAgICAgLy9DaGVjayBpZiB3ZSBoYXZlIGFuIHVwbHluayBhc3NldCwgaWYgbm90Li4uLiBUaGVuIGp1c3Qgc3RhcnQgcGxheWJhY2tcbiAgICAgICAgaWYgKHRoaXMuX2Fzc2V0SW5mb1NlcnZpY2UpIHtcbiAgICAgICAgICAgIHRoaXMuX2Fzc2V0SW5mb1NlcnZpY2UubG9hZFNlZ21lbnRNYXAodGhpcy5fc2VnbWVudE1hcCwgKCkgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlLnN0YXJ0KCk7XG4gICAgICAgICAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuU291cmNlTG9hZGVkKTtcblxuICAgICAgICAgICAgICAgIC8vc2V0IHRoZSBwb3N0ZXIgdXJsXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuX2NvbmZpZy5zaG93UG9zdGVyICYmIHRoaXMucGxheWxpc3RUeXBlID09PSAnVk9EJykge1xuICAgICAgICAgICAgICAgICAgICBsZXQgY29udGVudFNlZ21lbnQgPSB0aGlzLl9zZWdtZW50TWFwLmNvbnRlbnRTZWdtZW50c1swXTtcbiAgICAgICAgICAgICAgICAgICAgbGV0IGNvbnRlbnRBc3NldCA9IHRoaXMuX2Fzc2V0SW5mb1NlcnZpY2UuZ2V0QXNzZXRJbmZvKGNvbnRlbnRTZWdtZW50LmlkKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNvbnRlbnRBc3NldCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fdmlkZW8ucG9zdGVyID0gY29udGVudEFzc2V0LnBvc3RlclVybDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2Uuc3RhcnQoKTtcbiAgICAgICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLlNvdXJjZUxvYWRlZCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIF9vbkxvYWRFcnJvcihtZXNzYWdlOiBzdHJpbmcsIGNvZGU6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5Mb2FkRXJyb3IsIHsgZXJyb3I6IG1lc3NhZ2UsIGNvZGU6IGNvZGUgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25Ecm1FcnJvcihtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuRHJtRXJyb3IsIHsgZXJyb3I6IG1lc3NhZ2UgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25TZWdtZW50TWFwQ2hhbmdlZCgpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMucGxheWxpc3RUeXBlID09PSBcIlZPRFwiKSB7XG4gICAgICAgICAgICBpZiAoIXRoaXMuX3NlZ21lbnRNYXApIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9zZWdtZW50TWFwID0gbmV3IFNlZ21lbnRNYXAodGhpcy5fYWRhcHRpdmVTb3VyY2Uuc2VnbWVudE1hcCk7XG4gICAgICAgICAgICAgICAgdGhpcy5faW5pdFNlZ21lbnRUZXh0VHJhY2soKTtcbiAgICAgICAgICAgICAgICB0aGlzLl9pbml0QWRCcmVha1RleHRUcmFjaygpO1xuXG4gICAgICAgICAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuU2VnbWVudE1hcExvYWRlZCwgeyBzZWdtZW50TWFwOiB0aGlzLl9zZWdtZW50TWFwIH0pO1xuICAgICAgICAgICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLkxvYWRlZEFkQnJlYWtzLCB7IGFkQnJlYWtzOiB0aGlzLl9zZWdtZW50TWFwLmFkQnJlYWtzIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5fc2VnbWVudE1hcCA9IG5ldyBTZWdtZW50TWFwKHRoaXMuX2FkYXB0aXZlU291cmNlLnNlZ21lbnRNYXApO1xuICAgICAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuU2VnbWVudE1hcExvYWRlZCwgeyBzZWdtZW50TWFwOiB0aGlzLl9zZWdtZW50TWFwIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfc3RhcnRMaWNlbnNlUmVxdWVzdChkcm1JbmZvOmFueSwga3NVcmw6c3RyaW5nKTogdm9pZCB7XG4gICAgICAgIGlmICghdGhpcy5fbGljZW5zZU1hbmFnZXIpIHtcbiAgICAgICAgICAgIHRoaXMuX2xpY2Vuc2VNYW5hZ2VyID0gbmV3IExpY2Vuc2VNYW5hZ2VyKHRoaXMuX3ZpZGVvLHRoaXMuX2FkYXB0aXZlU291cmNlKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLl9saWNlbnNlTWFuYWdlci5zZXRLZXlTZXJ2ZXJQcmVmaXgoa3NVcmwpO1xuICAgICAgICB0aGlzLl9saWNlbnNlTWFuYWdlci5hZGRMaWNlbnNlUmVxdWVzdChkcm1JbmZvKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9sb2FkQmFuZHdpZHRoSGlzdG9yeSgpOiBTbGljZURvd25sb2FkTWV0cmljW11bXSB7XG4gICAgICAgIGxldCBoaXN0b3J5VmVyc2lvbiA9IHBhcnNlSW50KGxvY2FsU3RvcmFnZS5nZXRJdGVtKFwiVXBseW5rSGlzdG9yeVZlcnNpb25cIiksIDEwKSB8fCAwO1xuICAgICAgICAvLyBDdXJyZW50IHZlcnNpb24gaXMgMi4gSWYgb2xkZXIgdGhhbiB0aGF0LCBkb24ndCBsb2FkIGl0XG4gICAgICAgIGlmIChoaXN0b3J5VmVyc2lvbiA8IDIgJiYgbG9jYWxTdG9yYWdlLmdldEl0ZW0oXCJVcGx5bmtIaXN0b3J5XCIpICE9IG51bGwpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiW2FkYXB0aXZlLXBsYXllci50c10gX2xvYWRCYW5kd2lkdGhIaXN0b3J5IGZvdW5kIGFuIG9sZGVyIGhpc3RvcnkgdmVyc2lvbi4gUmVtb3ZpbmcgaXRcIik7XG4gICAgICAgICAgICBsb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbShcIlVwbHlua0hpc3RvcnlcIik7XG4gICAgICAgICAgICBsb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbShcIlVwbHlua0hpc3RvcnlUaW1lc3RhbXBcIik7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuICAgICAgICBsZXQgdGltZXN0YW1wU3RyID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oXCJVcGx5bmtIaXN0b3J5VGltZXN0YW1wXCIpO1xuICAgICAgICBsZXQgdGltZXN0YW1wID0gcGFyc2VJbnQodGltZXN0YW1wU3RyLCAxMCkgfHwgMDtcbiAgICAgICAgbGV0IG5vdyA9IERhdGUubm93KCk7XG5cbiAgICAgICAgY29uc3QgTUFYX0FHRSA9IDYwICogNjAgKiAxMDAwOyAvLyAxIGhyLCBpbiBtaWxsaXNlY1xuICAgICAgICBpZiAobm93IC0gdGltZXN0YW1wIDwgTUFYX0FHRSkge1xuICAgICAgICAgICAgbGV0IGhpc3RvcnkgPSBsb2NhbFN0b3JhZ2UuZ2V0SXRlbShcIlVwbHlua0hpc3RvcnlcIik7XG4gICAgICAgICAgICByZXR1cm4gSlNPTi5wYXJzZShoaXN0b3J5KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9zYXZlQmFuZHdpZHRoSGlzdG9yeShoaXN0b3J5OiBTbGljZURvd25sb2FkTWV0cmljW11bXSk6IHZvaWQge1xuICAgICAgICBpZiAoaGlzdG9yeSA9PSBudWxsKSByZXR1cm47XG5cbiAgICAgICAgbGV0IHRpbWVzdGFtcCA9IERhdGUubm93KClcbiAgICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oXCJVcGx5bmtIaXN0b3J5VmVyc2lvblwiLCBcIjJcIik7XG4gICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKFwiVXBseW5rSGlzdG9yeVRpbWVzdGFtcFwiLCB0aW1lc3RhbXAudG9TdHJpbmcoKSk7XG4gICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKFwiVXBseW5rSGlzdG9yeVwiLCBKU09OLnN0cmluZ2lmeShoaXN0b3J5KSk7XG4gICAgfVxuXG4gICAgZ2V0VGh1bWJuYWlsKHRpbWU6IG51bWJlciwgc2l6ZTogXCJzbWFsbFwiIHwgXCJsYXJnZVwiID0gXCJzbWFsbFwiKTogdGh1bWIuVGh1bWJuYWlsIHtcbiAgICAgICAgcmV0dXJuIHRodW1iLmdldFRodW1ibmFpbCh0aW1lLCB0aGlzLl9zZWdtZW50TWFwLCB0aGlzLl9hc3NldEluZm9TZXJ2aWNlLCBzaXplKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9pbml0U2VnbWVudFRleHRUcmFjaygpOiB2b2lkIHtcbiAgICAgICAgaWYgKHR5cGVvZiBWVFRDdWUgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICAvL2JhaWwsIGNhbid0IGNyZWF0ZSBjdWVzXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgc2VnbWVudFRleHRUcmFjayA9IHRoaXMuX2dldE9yQ3JlYXRlVGV4dFRyYWNrKFwibWV0YWRhdGFcIiwgXCJzZWdtZW50c1wiKTtcblxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX3NlZ21lbnRNYXAubGVuZ3RoOyBpKyspIHtcblxuICAgICAgICAgICAgbGV0IHNlZ21lbnQgPSB0aGlzLl9zZWdtZW50TWFwLmdldFNlZ21lbnRBdChpKTtcbiAgICAgICAgICAgIGlmIChzZWdtZW50ICYmIHNlZ21lbnQuaWQgJiYgc2VnbWVudC5pZCAhPT0gJycpIHtcbiAgICAgICAgICAgICAgICBsZXQgY3VlID0gbmV3IFZUVEN1ZShzZWdtZW50LnN0YXJ0VGltZSwgc2VnbWVudC5lbmRUaW1lLCBzZWdtZW50LmlkKTtcblxuICAgICAgICAgICAgICAgIGlmIChjdWUgIT09IHVuZGVmaW5lZCkge1xuXG4gICAgICAgICAgICAgICAgICAgIGN1ZS5hZGRFdmVudExpc3RlbmVyKFwiZW50ZXJcIiwgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuX2Fzc2V0SW5mb1NlcnZpY2UpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9hc3NldEluZm9TZXJ2aWNlLmxvYWRTZWdtZW50KHNlZ21lbnQsIChhc3NldEluZm86IEFzc2V0SW5mbykgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5Bc3NldEVudGVyZWQsIHsgc2VnbWVudDogc2VnbWVudCwgYXNzZXQ6IGFzc2V0SW5mbyB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuQXNzZXRFbnRlcmVkLCB7IHNlZ21lbnQ6IHNlZ21lbnQsIGFzc2V0OiBudWxsIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgICAgICBjdWUuYWRkRXZlbnRMaXN0ZW5lcihcImV4aXRcIiwgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuX2Fzc2V0SW5mb1NlcnZpY2UpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9hc3NldEluZm9TZXJ2aWNlLmxvYWRTZWdtZW50KHNlZ21lbnQsIChhc3NldEluZm86IEFzc2V0SW5mbykgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5Bc3NldEV4aXRlZCwgeyBzZWdtZW50OiBzZWdtZW50LCBhc3NldDogYXNzZXRJbmZvIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5Bc3NldEVudGVyZWQsIHsgc2VnbWVudDogc2VnbWVudCwgYXNzZXQ6IG51bGwgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgICAgIHNlZ21lbnRUZXh0VHJhY2suYWRkQ3VlKGN1ZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfaW5pdEFkQnJlYWtUZXh0VHJhY2soKTogdm9pZCB7XG4gICAgICAgIGlmICh0eXBlb2YgVlRUQ3VlID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgLy9iYWlsLCBjYW4ndCBjcmVhdGUgY3Vlc1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IGFkQnJlYWtzID0gdGhpcy5fc2VnbWVudE1hcC5hZEJyZWFrcztcbiAgICAgICAgaWYgKGFkQnJlYWtzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IHRyYWNrID0gdGhpcy5fZ2V0T3JDcmVhdGVUZXh0VHJhY2soXCJtZXRhZGF0YVwiLCBcImFkYnJlYWtzXCIpO1xuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYWRCcmVha3MubGVuZ3RoOyBpKyspIHtcblxuICAgICAgICAgICAgbGV0IGFkQnJlYWsgPSBhZEJyZWFrc1tpXTtcbiAgICAgICAgICAgIGxldCBjdWUgPSBuZXcgVlRUQ3VlKGFkQnJlYWsuc3RhcnRUaW1lLCBhZEJyZWFrLmVuZFRpbWUsIFwiYWRicmVha1wiKTtcblxuICAgICAgICAgICAgaWYgKGN1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cbiAgICAgICAgICAgICAgICBjdWUuYWRkRXZlbnRMaXN0ZW5lcihcImVudGVyXCIsICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuQWRCcmVha0VudGVyZWQsIHsgYWRCcmVhazogYWRCcmVhayB9KTtcbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgIGN1ZS5hZGRFdmVudExpc3RlbmVyKFwiZXhpdFwiLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLkFkQnJlYWtFeGl0ZWQsIHsgYWRCcmVhazogYWRCcmVhayB9KTtcbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgIHRyYWNrLmFkZEN1ZShjdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuX2lzRmlyZWZveCAmJiAhdGhpcy5fdmlkZW8uYXV0b3BsYXkgJiYgYWRCcmVha3NbMF0uc3RhcnRUaW1lID09PSAwICYmIHRoaXMuX3ZpZGVvLmN1cnJlbnRUaW1lID09PSAwKSB7XG4gICAgICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5BZEJyZWFrRW50ZXJlZCwgeyBhZEJyZWFrOiBhZEJyZWFrc1swXSB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgX2dldE9yQ3JlYXRlVGV4dFRyYWNrKGtpbmQ6IHN0cmluZywgbGFiZWw6IHN0cmluZyk6IFRleHRUcmFjayB7XG4gICAgICAgIC8vbG9vayBmb3IgcHJldmlvdXNseSBjcmVhdGVkIHRyYWNrXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fdmlkZW8udGV4dFRyYWNrcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgbGV0IHRyYWNrID0gdGhpcy5fdmlkZW8udGV4dFRyYWNrc1tpXTtcbiAgICAgICAgICAgIGlmICh0cmFjay5raW5kID09PSBraW5kICYmIHRyYWNrLmxhYmVsID09PSBsYWJlbCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0cmFjaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vcmV0dXJuIG5ldyB0cmFja1xuICAgICAgICByZXR1cm4gdGhpcy5fdmlkZW8uYWRkVGV4dFRyYWNrKGtpbmQsIGxhYmVsKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgb25UZXh0VHJhY2tDaGFuZ2VkKGNoYW5nZVRyYWNrRXZlbnQ6IFRyYWNrRXZlbnQpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2Uub25UZXh0VHJhY2tDaGFuZ2VkKGNoYW5nZVRyYWNrRXZlbnQpO1xuICAgIH1cblxuICAgIHByaXZhdGUgdXBkYXRlVmlkZW9SZWN0KCk6IHZvaWQge1xuICAgICAgICBsZXQgY3VycmVudFZpZGVvUmVjdCA9IHRoaXMuX3ZpZGVvLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXG4gICAgICAgIGlmICgoIXRoaXMuX3ZpZGVvUmVjdCkgfHwgKHRoaXMuX3ZpZGVvUmVjdC53aWR0aCAhPSBjdXJyZW50VmlkZW9SZWN0LndpZHRoIHx8IHRoaXMuX3ZpZGVvUmVjdC5oZWlnaHQgIT0gY3VycmVudFZpZGVvUmVjdC5oZWlnaHQpKSB7XG4gICAgICAgICAgICB0aGlzLl92aWRlb1JlY3QgPSBjdXJyZW50VmlkZW9SZWN0O1xuICAgICAgICAgICAgaWYgKHRoaXMuX2FkYXB0aXZlU291cmNlICYmIHRoaXMuX2NvbmZpZy5saW1pdFJlc29sdXRpb25Ub1ZpZXdTaXplKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2Uuc2V0TWF4VmlkZW9SZXNvbHV0aW9uKGN1cnJlbnRWaWRlb1JlY3QuaGVpZ2h0LCBjdXJyZW50VmlkZW9SZWN0LndpZHRoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgX29uQXVkaW9UcmFja1N3aXRjaGVkKCk6IHZvaWQge1xuICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5BdWRpb1RyYWNrU3dpdGNoZWQpO1xuICAgIH1cblxuICAgIGdldCBhdWRpb1RyYWNrcygpOiBVcGx5bmsuQXVkaW9UcmFja1tdIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlU291cmNlLmF1ZGlvVHJhY2tzO1xuICAgIH1cblxuICAgIGdldCBhdWRpb1RyYWNrKCk6IFVwbHluay5BdWRpb1RyYWNrIHtcbiAgICAgICAgbGV0IGF1ZGlvVHJhY2tzID0gdGhpcy5hdWRpb1RyYWNrcztcblxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGF1ZGlvVHJhY2tzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBpZiAoYXVkaW9UcmFja3NbaV0uZW5hYmxlZCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBhdWRpb1RyYWNrc1tpXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGdldCBhdWRpb1RyYWNrSWQoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlU291cmNlLmF1ZGlvVHJhY2tJZDtcbiAgICB9XG5cbiAgICBzZXQgYXVkaW9UcmFja0lkKGlkOiBudW1iZXIpIHtcbiAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2UuYXVkaW9UcmFja0lkID0gaWQ7XG4gICAgfVxuXG4gICAgZ2V0IGRvbWFpbigpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVTb3VyY2UuZG9tYWluO1xuICAgIH1cblxuICAgIGdldCBzZXNzaW9uSWQoKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlU291cmNlLnNlc3Npb25JZDtcbiAgICB9XG5cbiAgICBnZXQgbnVtYmVyT2ZSYXlzKCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5udW1iZXJPZlJheXM7XG4gICAgfVxuXG4gICAgZ2V0IGF2YWlsYWJsZUJhbmR3aWR0aHMoKTogbnVtYmVyW10ge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVTb3VyY2UuYXZhaWxhYmxlQmFuZHdpZHRocztcbiAgICB9XG5cbiAgICBnZXQgYXZhaWxhYmxlUmVzb2x1dGlvbnMoKTogUmVzb2x1dGlvbltdIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlU291cmNlLmF2YWlsYWJsZVJlc29sdXRpb25zO1xuICAgIH1cblxuICAgIGdldCBhdmFpbGFibGVNaW1lVHlwZXMoKTogTWltZVR5cGVbXSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5hdmFpbGFibGVNaW1lVHlwZXM7XG4gICAgfVxuXG4gICAgZ2V0IHNlZ21lbnRNYXAoKTogU2VnbWVudE1hcCB7XG4gICAgICAgIHJldHVybiB0aGlzLl9zZWdtZW50TWFwO1xuICAgIH1cblxuICAgIGdldCBhZEJyZWFrcygpOiBBZEJyZWFrW10ge1xuICAgICAgICByZXR1cm4gdGhpcy5fc2VnbWVudE1hcC5hZEJyZWFrcztcbiAgICB9XG5cbiAgICBnZXQgZHVyYXRpb24oKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlU291cmNlID8gdGhpcy5fYWRhcHRpdmVTb3VyY2UuZHVyYXRpb24gOiAwO1xuICAgIH1cblxuICAgIGdldCBwbGF5bGlzdFR5cGUoKTogXCJWT0RcIiB8IFwiRVZFTlRcIiB8IFwiTElWRVwiIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlU291cmNlLnBsYXlsaXN0VHlwZTtcbiAgICB9XG5cbiAgICBnZXQgc3VwcG9ydHNUaHVtYm5haWxzKCk6IGJvb2xlYW4ge1xuICAgICAgICAvL29ubHkgc3VwcG9ydCB0aHVtYm5haWxzIGlmIHdlIGhhdmUgdmlkZW8gKG5vdCBhdWRpbyBvbmx5KVxuICAgICAgICByZXR1cm4gdGhpcy5hdmFpbGFibGVSZXNvbHV0aW9ucy5sZW5ndGggPiAwXG4gICAgfVxuXG4gICAgZ2V0IGNsYXNzTmFtZSgpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gJ0FkYXB0aXZlUGxheWVyJztcbiAgICB9XG5cbiAgICBnZXQgdmVyc2lvbigpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gJzAyLjAwLjE4MDMyNzAwJzsgLy93aWxsIGJlIG1vZGlmaWVkIGJ5IHRoZSBidWlsZCBzY3JpcHRcbiAgICB9XG5cbiAgICBnZXQgdmlkZW9CdWZmZXJlZCgpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVTb3VyY2UudmlkZW9CdWZmZXJlZDtcbiAgICB9XG5cbiAgICBnZXQgYXVkaW9CdWZmZXJlZCgpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVTb3VyY2UuYXVkaW9CdWZmZXJlZDtcbiAgICB9XG59IiwiZXhwb3J0IGNvbnN0IEV2ZW50cyA9IHtcbiAgICBCZWFtTG9hZGVkOiAgICAgICAgICdiZWFtbG9hZGVkJyxcbiAgICBUcmFja0xvYWRlZDogICAgICAgICd0cmFja2xvYWRlZCcsXG4gICAgU291cmNlTG9hZGVkOiAgICAgICAnc291cmNlbG9hZGVkJyxcbiAgICBMb2FkRXJyb3I6ICAgICAgICAgICdsb2FkZXJyb3InLFxuICAgIERybUVycm9yOiAgICAgICAgICAgJ2RybWVycm9yJyxcbiAgICBTZWdtZW50TWFwTG9hZGVkOiAgICdzZWdtZW50bWFwTG9hZGVkJyxcbiAgICBMb2FkZWRBZEJyZWFrczogICAgICdsb2FkZWRhZGJyZWFrcycsXG4gICAgSUQzVGFnOiAgICAgICAgICAgICAnaWQzVGFnJyxcbiAgICBUeHh4SUQzRnJhbWU6ICAgICAgICd0eHh4SWQzRnJhbWUnLFxuICAgIFByaXZJRDNGcmFtZTogICAgICAgJ3ByaXZJZDNGcmFtZScsXG4gICAgVGV4dElEM0ZyYW1lOiAgICAgICAndGV4dElkM0ZyYW1lJyxcbiAgICBTbGljZUVudGVyZWQ6ICAgICAgICdzbGljZUVudGVyZWQnLFxuICAgIEFzc2V0RW50ZXJlZDogICAgICAgJ2Fzc2V0ZW50ZXJlZCcsXG4gICAgQXNzZXRFeGl0ZWQ6ICAgICAgICAnYXNzZXRleGl0ZWQnLFxuICAgIEFkQnJlYWtFbnRlcmVkOiAgICAgJ2FkYnJlYWtlbnRlcmVkJyxcbiAgICBBZEJyZWFrRXhpdGVkOiAgICAgICdhZGJyZWFrZXhpdGVkJyxcbiAgICBSZWFkeTogICAgICAgICAgICAgICdyZWFkeScsXG4gICAgQXVkaW9UcmFja1N3aXRjaGVkOiAnYXVkaW9UcmFja1N3aXRjaGVkJyxcbiAgICBBdWRpb1RyYWNrQWRkZWQ6ICAgICdhdWRpb1RyYWNrQWRkZWQnLFxufTsiLCJpbXBvcnQgeyBzbGljZSB9IGZyb20gJy4uL3V0aWxzL3V0aWxzJztcblxuZXhwb3J0IGludGVyZmFjZSBUeHh4RGF0YSB7XG4gICAgdHlwZTogc3RyaW5nO1xuICAgIGtleTogc3RyaW5nO1xuICAgIHZhbHVlOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVGV4dEZyYW1lIHtcbiAgICB2YWx1ZTogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFR4eHhGcmFtZSB7XG4gICAgZGVzY3JpcHRpb246IHN0cmluZztcbiAgICB2YWx1ZTogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByaXZGcmFtZSB7XG4gICAgb3duZXI6IHN0cmluZztcbiAgICBkYXRhOiBVaW50OEFycmF5O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElEM0ZyYW1lIHtcbiAgICB0eXBlOiBzdHJpbmc7XG4gICAgc2l6ZTogbnVtYmVyO1xuICAgIGRhdGE6IFVpbnQ4QXJyYXk7XG59XG5cbmV4cG9ydCBjbGFzcyBJRDNEZWNvZGVyIHtcblxuICAgIHN0YXRpYyBnZXRGcmFtZShidWZmZXI6IFVpbnQ4QXJyYXkpOiBJRDNGcmFtZSB7XG4gICAgICAgIGlmIChidWZmZXIubGVuZ3RoIDwgMjEpIHtcbiAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIH1cblxuICAgICAgICAvKiBodHRwOi8vaWQzLm9yZy9pZDN2Mi4zLjBcbiAgICAgICAgKy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tK1xuICAgICAgICB8ICAgICAgSGVhZGVyICgxMCBieXRlcykgICAgICB8XG4gICAgICAgICstLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLStcbiAgICAgICAgWzBdICAgICA9ICdJJ1xuICAgICAgICBbMV0gICAgID0gJ0QnXG4gICAgICAgIFsyXSAgICAgPSAnMydcbiAgICAgICAgWzMsNF0gICA9IHtWZXJzaW9ufVxuICAgICAgICBbNV0gICAgID0ge0ZsYWdzfVxuICAgICAgICBbNi05XSAgID0ge0lEMyBTaXplfVxuICAgICAgICBbMTAtMTNdID0ge0ZyYW1lIElEfVxuICAgICAgICBbMTQtMTddID0ge0ZyYW1lIFNpemV9XG4gICAgICAgIFsxOCwxOV0gPSB7RnJhbWUgRmxhZ3N9IFxuICAgICAgICAqL1xuICAgICAgICBpZiAoYnVmZmVyWzBdID09PSA3MyAmJiAgLy8gSVxuICAgICAgICAgICAgYnVmZmVyWzFdID09PSA2OCAmJiAgLy8gRFxuICAgICAgICAgICAgYnVmZmVyWzJdID09PSA1MSkgeyAgLy8gM1xuXG4gICAgICAgICAgICBsZXQgZnJhbWVUeXBlID0gU3RyaW5nLmZyb21DaGFyQ29kZShidWZmZXJbMTBdLCBidWZmZXJbMTFdLCBidWZmZXJbMTJdLCBidWZmZXJbMTNdKTtcblxuICAgICAgICAgICAgbGV0IHNpemUgPSAwO1xuICAgICAgICAgICAgc2l6ZSA9IChidWZmZXJbMTRdIDw8IDI0KTtcbiAgICAgICAgICAgIHNpemUgfD0gKGJ1ZmZlclsxNV0gPDwgMTYpO1xuICAgICAgICAgICAgc2l6ZSB8PSAoYnVmZmVyWzE2XSA8PCA4KTtcbiAgICAgICAgICAgIHNpemUgfD0gYnVmZmVyWzE3XTtcblxuICAgICAgICAgICAgbGV0IGRhdGEgPSBzbGljZShidWZmZXIsIDIwKTtcbiAgICAgICAgICAgIHJldHVybiB7IHR5cGU6IGZyYW1lVHlwZSwgc2l6ZTogc2l6ZSwgZGF0YTogZGF0YSB9O1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICBzdGF0aWMgZGVjb2RlVGV4dEZyYW1lKGlkM0ZyYW1lOiBJRDNGcmFtZSk6IFRleHRGcmFtZSB7XG4gICAgICAgIC8qXG4gICAgICAgIEZvcm1hdDpcbiAgICAgICAgWzBdICAgPSB7VGV4dCBFbmNvZGluZ31cbiAgICAgICAgWzEtP10gPSB7VmFsdWV9XG4gICAgICAgICovXG5cbiAgICAgICAgaWYgKGlkM0ZyYW1lLnNpemUgPCAyKSB7XG4gICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGlkM0ZyYW1lLmRhdGFbMF0gIT09IDMpIHtcbiAgICAgICAgICAgIC8vb25seSBzdXBwb3J0IFVURi04XG4gICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBsZXQgZGF0YSA9IHNsaWNlKGlkM0ZyYW1lLmRhdGEsIDEpO1xuICAgICAgICByZXR1cm4geyB2YWx1ZTogSUQzRGVjb2Rlci51dGY4QXJyYXlUb1N0cihkYXRhKSB9O1xuICAgIH1cblxuICAgIHN0YXRpYyBkZWNvZGVUeHh4RnJhbWUoaWQzRnJhbWU6IElEM0ZyYW1lKTogVHh4eEZyYW1lIHtcbiAgICAgICAgLypcbiAgICAgICAgRm9ybWF0OlxuICAgICAgICBbMF0gICA9IHtUZXh0IEVuY29kaW5nfVxuICAgICAgICBbMS0/XSA9IHtEZXNjcmlwdGlvbn1cXDB7VmFsdWV9XG4gICAgICAgICovXG5cbiAgICAgICAgaWYgKGlkM0ZyYW1lLnNpemUgPCAyKSB7XG4gICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGlkM0ZyYW1lLmRhdGFbMF0gIT09IDMpIHtcbiAgICAgICAgICAgIC8vb25seSBzdXBwb3J0IFVURi04XG4gICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IGluZGV4ID0gMTtcbiAgICAgICAgbGV0IGRlc2NyaXB0aW9uID0gSUQzRGVjb2Rlci51dGY4QXJyYXlUb1N0cihzbGljZShpZDNGcmFtZS5kYXRhLCBpbmRleCkpO1xuXG4gICAgICAgIGluZGV4ICs9IGRlc2NyaXB0aW9uLmxlbmd0aCArIDE7XG4gICAgICAgIGxldCB2YWx1ZSA9IElEM0RlY29kZXIudXRmOEFycmF5VG9TdHIoc2xpY2UoaWQzRnJhbWUuZGF0YSwgaW5kZXgpKTtcblxuICAgICAgICByZXR1cm4geyBkZXNjcmlwdGlvbjogZGVzY3JpcHRpb24sIHZhbHVlOiB2YWx1ZSB9O1xuICAgIH1cblxuICAgIHN0YXRpYyBkZWNvZGVQcml2RnJhbWUoaWQzRnJhbWU6IElEM0ZyYW1lKTogUHJpdkZyYW1lIHtcbiAgICAgICAgLypcbiAgICAgICAgRm9ybWF0OiA8dGV4dCBzdHJpbmc+XFwwPGJpbmFyeSBkYXRhPlxuICAgICAgICAqL1xuXG4gICAgICAgIGlmIChpZDNGcmFtZS5zaXplIDwgMikge1xuICAgICAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vZmluZCBudWxsIHRlcm1pbmF0b3JcbiAgICAgICAgbGV0IG51bGxJbmRleCA9IDA7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgaWQzRnJhbWUuZGF0YS5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgaWYgKGlkM0ZyYW1lLmRhdGFbaV0gPT09IDApIHtcbiAgICAgICAgICAgICAgICBudWxsSW5kZXggPSBpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgbGV0IG93bmVyID0gU3RyaW5nLmZyb21DaGFyQ29kZS5hcHBseShudWxsLCBzbGljZShpZDNGcmFtZS5kYXRhLCAwLCBudWxsSW5kZXgpKTtcbiAgICAgICAgbGV0IHByaXZhdGVEYXRhID0gc2xpY2UoaWQzRnJhbWUuZGF0YSwgbnVsbEluZGV4ICsgMSk7XG5cbiAgICAgICAgcmV0dXJuIHsgb3duZXI6IG93bmVyLCBkYXRhOiBwcml2YXRlRGF0YSB9O1xuICAgIH1cblxuICAgIC8vIGh0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9xdWVzdGlvbnMvODkzNjk4NC91aW50OGFycmF5LXRvLXN0cmluZy1pbi1qYXZhc2NyaXB0LzIyMzczMTk3XG4gICAgLy8gaHR0cDovL3d3dy5vbmljb3MuY29tL3N0YWZmL2l6L2FtdXNlL2phdmFzY3JpcHQvZXhwZXJ0L3V0Zi50eHRcbiAgICAvKiB1dGYuanMgLSBVVEYtOCA8PT4gVVRGLTE2IGNvbnZlcnRpb25cbiAgICAgKlxuICAgICAqIENvcHlyaWdodCAoQykgMTk5OSBNYXNhbmFvIEl6dW1vIDxpekBvbmljb3MuY28uanA+XG4gICAgICogVmVyc2lvbjogMS4wXG4gICAgICogTGFzdE1vZGlmaWVkOiBEZWMgMjUgMTk5OVxuICAgICAqIFRoaXMgbGlicmFyeSBpcyBmcmVlLiAgWW91IGNhbiByZWRpc3RyaWJ1dGUgaXQgYW5kL29yIG1vZGlmeSBpdC5cbiAgICAgKi9cbiAgICBzdGF0aWMgdXRmOEFycmF5VG9TdHIoYXJyYXk6IFVpbnQ4QXJyYXkpOiBzdHJpbmcge1xuXG4gICAgICAgIGxldCBjaGFyMjogYW55O1xuICAgICAgICBsZXQgY2hhcjM6IGFueTtcbiAgICAgICAgbGV0IG91dCA9IFwiXCI7XG4gICAgICAgIGxldCBpID0gMDtcbiAgICAgICAgbGV0IGxlbmd0aCA9IGFycmF5Lmxlbmd0aDtcblxuICAgICAgICB3aGlsZSAoaSA8IGxlbmd0aCkge1xuICAgICAgICAgICAgbGV0IGMgPSBhcnJheVtpKytdO1xuICAgICAgICAgICAgc3dpdGNoIChjID4+IDQpIHtcbiAgICAgICAgICAgICAgICBjYXNlIDA6XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgICAgICAgICAgY2FzZSAxOiBjYXNlIDI6IGNhc2UgMzogY2FzZSA0OiBjYXNlIDU6IGNhc2UgNjogY2FzZSA3OlxuICAgICAgICAgICAgICAgICAgICAvLyAweHh4eHh4eFxuICAgICAgICAgICAgICAgICAgICBvdXQgKz0gU3RyaW5nLmZyb21DaGFyQ29kZShjKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAxMjogY2FzZSAxMzpcbiAgICAgICAgICAgICAgICAgICAgLy8gMTEweCB4eHh4ICAgMTB4eCB4eHh4XG4gICAgICAgICAgICAgICAgICAgIGNoYXIyID0gYXJyYXlbaSsrXTtcbiAgICAgICAgICAgICAgICAgICAgb3V0ICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoKChjICYgMHgxRikgPDwgNikgfCAoY2hhcjIgJiAweDNGKSk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgMTQ6XG4gICAgICAgICAgICAgICAgICAgIC8vIDExMTAgeHh4eCAgMTB4eCB4eHh4ICAxMHh4IHh4eHhcbiAgICAgICAgICAgICAgICAgICAgY2hhcjIgPSBhcnJheVtpKytdO1xuICAgICAgICAgICAgICAgICAgICBjaGFyMyA9IGFycmF5W2krK107XG4gICAgICAgICAgICAgICAgICAgIG91dCArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKCgoYyAmIDB4MEYpIDw8IDEyKSB8XG4gICAgICAgICAgICAgICAgICAgICAgICAoKGNoYXIyICYgMHgzRikgPDwgNikgfFxuICAgICAgICAgICAgICAgICAgICAgICAgKChjaGFyMyAmIDB4M0YpIDw8IDApKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gb3V0O1xuICAgIH1cbn0iLCJpbXBvcnQgeyBPYnNlcnZhYmxlIH0gZnJvbSAnLi4vdXRpbHMvb2JzZXJ2YWJsZSc7XG5pbXBvcnQgeyBUeHh4RGF0YSwgVHh4eEZyYW1lLCBUZXh0RnJhbWUsIFByaXZGcmFtZSwgSUQzRnJhbWUsIElEM0RlY29kZXIgfSBmcm9tICcuL2lkMy1kZWNvZGVyJztcbmltcG9ydCB7IGJhc2U2NFRvQnVmZmVyIH0gZnJvbSAnLi4vdXRpbHMvdXRpbHMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFR4eHhJRDNGcmFtZUV2ZW50IHtcbiAgICBjdWU6IFRleHRUcmFja0N1ZTtcbiAgICBmcmFtZTogVHh4eEZyYW1lO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByaXZJRDNGcmFtZUV2ZW50IHtcbiAgICBjdWU6IFRleHRUcmFja0N1ZTtcbiAgICBmcmFtZTogUHJpdkZyYW1lO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFRleHRJRDNGcmFtZUV2ZW50IHtcbiAgICBjdWU6IFRleHRUcmFja0N1ZTtcbiAgICBmcmFtZTogVGV4dEZyYW1lO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElEM1RhZ0V2ZW50IHtcbiAgICBjdWU6IFRleHRUcmFja0N1ZTtcbiAgICBmcmFtZTogSUQzRnJhbWU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2xpY2VFdmVudCB7XG4gICAgY3VlOiBUZXh0VHJhY2tDdWU7XG4gICAgYXNzZXRJZDogc3RyaW5nO1xuICAgIHJheUNoYXI6IHN0cmluZztcbiAgICBzbGljZUluZGV4OiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBXZWJLaXRUeHh4Q3VlIHtcbiAgICBrZXk6IHN0cmluZztcbiAgICBkYXRhOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBXZWJLaXRQcml2Q3VlIHtcbiAgICBrZXk6IHN0cmluZztcbiAgICBpbmZvOiBzdHJpbmc7XG4gICAgZGF0YTogQXJyYXlCdWZmZXI7XG59XG5cbmV4cG9ydCBjbGFzcyBJRDNIYW5kbGVyIGV4dGVuZHMgT2JzZXJ2YWJsZSB7XG4gICAgY29uc3RydWN0b3IodmlkZW86IEhUTUxWaWRlb0VsZW1lbnQpIHtcbiAgICAgICAgc3VwZXIoKTtcbiAgICAgICAgdmlkZW8udGV4dFRyYWNrcy5hZGRFdmVudExpc3RlbmVyKCdhZGR0cmFjaycsIHRoaXMuX29uQWRkVHJhY2suYmluZCh0aGlzKSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25BZGRUcmFjayhhZGRUcmFja0V2ZW50OiBhbnkpIHtcbiAgICAgICAgbGV0IHRyYWNrOiBUZXh0VHJhY2sgPSBhZGRUcmFja0V2ZW50LnRyYWNrO1xuICAgICAgICBpZiAodGhpcy5faXNJZDNNZXRhZGF0YVRyYWNrKHRyYWNrKSkge1xuICAgICAgICAgICAgdHJhY2subW9kZSA9ICdoaWRkZW4nO1xuICAgICAgICAgICAgdHJhY2suYWRkRXZlbnRMaXN0ZW5lcignY3VlY2hhbmdlJywgdGhpcy5fb25JRDNDdWVDaGFuZ2UuYmluZCh0aGlzKSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIF9pc0lkM01ldGFkYXRhVHJhY2sodHJhY2s6IFRleHRUcmFjayk6IGJvb2xlYW4ge1xuICAgICAgICBpZiAodHJhY2sua2luZCA9PSBcIm1ldGFkYXRhXCIgJiYgdHJhY2subGFiZWwgPT0gXCJJRDNcIikge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodHJhY2sua2luZCA9PSBcIm1ldGFkYXRhXCIgJiYgdHJhY2suaW5CYW5kTWV0YWRhdGFUcmFja0Rpc3BhdGNoVHlwZSkge1xuICAgICAgICAgICAgdmFyIGRpc3BhdGNoVHlwZSA9IHRyYWNrLmluQmFuZE1ldGFkYXRhVHJhY2tEaXNwYXRjaFR5cGU7XG4gICAgICAgICAgICByZXR1cm4gZGlzcGF0Y2hUeXBlID09PSBcImNvbS5hcHBsZS5zdHJlYW1pbmdcIiB8fCBkaXNwYXRjaFR5cGUgPT09IFwiMTUyNjBERkZGRjQ5NDQzMzIwRkY0OTQ0MzMyMDAwMEZcIjtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vbklEM0N1ZUNoYW5nZShjdWVDaGFuZ2VFdmVudDogYW55KSB7XG4gICAgICAgIGxldCB0cmFjayA9IGN1ZUNoYW5nZUV2ZW50LnRhcmdldDtcblxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRyYWNrLmFjdGl2ZUN1ZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGxldCBjdWUgPSB0cmFjay5hY3RpdmVDdWVzW2ldO1xuICAgICAgICAgICAgaWYgKCFjdWUub25lbnRlcikge1xuICAgICAgICAgICAgICAgIHRoaXMuX29uSUQzQ3VlKGN1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRyYWNrLmN1ZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGxldCBjdWUgPSB0cmFjay5jdWVzW2ldO1xuICAgICAgICAgICAgaWYgKCFjdWUub25lbnRlcikge1xuICAgICAgICAgICAgICAgIGN1ZS5vbmVudGVyID0gKGN1ZUV2ZW50OiBhbnkpID0+IHsgdGhpcy5fb25JRDNDdWUoY3VlRXZlbnQudGFyZ2V0KTsgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgX29uSUQzQ3VlKGN1ZTogVGV4dFRyYWNrQ3VlKSB7XG4gICAgICAgIGxldCBkYXRhOiBVaW50OEFycmF5ID0gdW5kZWZpbmVkO1xuICAgICAgICBsZXQgaWQzRnJhbWU6IElEM0ZyYW1lID0gdW5kZWZpbmVkO1xuICAgICAgICBsZXQgdHh4eEZyYW1lOiBUeHh4RnJhbWUgPSB1bmRlZmluZWQ7XG4gICAgICAgIGxldCB0ZXh0RnJhbWU6IFRleHRGcmFtZSA9IHVuZGVmaW5lZDtcbiAgICAgICAgbGV0IHByaXZGcmFtZTogUHJpdkZyYW1lID0gdW5kZWZpbmVkO1xuXG4gICAgICAgIGlmICgoPGFueT5jdWUpLmRhdGEpIHtcbiAgICAgICAgICAgIC8vbXMgZWRnZSAobmF0aXZlKSBwdXRzIGlkMyBkYXRhIGluIGN1ZS5kYXRhIHByb3BlcnR5XG4gICAgICAgICAgICBkYXRhID0gbmV3IFVpbnQ4QXJyYXkoKDxhbnk+Y3VlKS5kYXRhKTtcbiAgICAgICAgfSBlbHNlIGlmICgoPGFueT5jdWUpLnZhbHVlICYmICg8YW55PmN1ZSkudmFsdWUua2V5ICYmICg8YW55PmN1ZSkudmFsdWUuZGF0YSkge1xuXG4gICAgICAgICAgICAvL3NhZmFyaSAobmF0aXZlKSBwdXRzIGlkMyBkYXRhIGluIFdlYktpdERhdGFDdWUgb2JqZWN0cy5cbiAgICAgICAgICAgIC8vIG5vIGVuY29kZWQgZGF0YSBhdmFpbGFibGUuIHNhZmFyaSBkZWNvZGVzIGZyYW1lcyBuYXRpdmVseVxuICAgICAgICAgICAgLy8gaS5lLlxuICAgICAgICAgICAgLy8gdmFsdWU6IHtrZXk6IFwiVFhYWFwiLCBkYXRhOiBcIjZjMzUzN2VjMzMyNDQ2MTQ5ZjFkNTRkZGJlYmVhNDE0X2hfMDAwMDAxNDBcIn1cbiAgICAgICAgICAgIC8vIG9yXG4gICAgICAgICAgICAvLyB2YWx1ZToge2tleTogXCJQUklWXCIsIGluZm86IFwiY29tLmVzcG4uYXV0aG5ldC5oZWFydGJlYXRcIiwgZGF0YTogQXJyYXlCdWZmZXJ9XG5cbiAgICAgICAgICAgIGlmICgoPGFueT5jdWUpLnZhbHVlLmtleSA9PT0gJ1RYWFgnKSB7XG4gICAgICAgICAgICAgICAgbGV0IHR4eHhDdWU6IFdlYktpdFR4eHhDdWUgPSAoPGFueT5jdWUpLnZhbHVlO1xuICAgICAgICAgICAgICAgIHR4eHhGcmFtZSA9IHsgdmFsdWU6IHR4eHhDdWUuZGF0YSwgZGVzY3JpcHRpb246IHVuZGVmaW5lZCB9O1xuICAgICAgICAgICAgfSBlbHNlIGlmICgoPGFueT5jdWUpLnZhbHVlLmtleSA9PT0gJ1BSSVYnKSB7XG4gICAgICAgICAgICAgICAgbGV0IHByaXZDdWU6IFdlYktpdFByaXZDdWUgPSAoPGFueT5jdWUpLnZhbHVlO1xuICAgICAgICAgICAgICAgIHByaXZGcmFtZSA9IHsgb3duZXI6IHByaXZDdWUuaW5mbywgZGF0YTogbmV3IFVpbnQ4QXJyYXkocHJpdkN1ZS5kYXRhKSB9O1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy91cGx5bmsgY3JlYXRlZCBpZDMgY3Vlc1xuICAgICAgICAgICAgZGF0YSA9IGJhc2U2NFRvQnVmZmVyKGN1ZS50ZXh0KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChkYXRhKSB7XG4gICAgICAgICAgICBpZDNGcmFtZSA9IElEM0RlY29kZXIuZ2V0RnJhbWUoZGF0YSk7XG4gICAgICAgICAgICBpZiAoaWQzRnJhbWUpIHtcbiAgICAgICAgICAgICAgICBpZiAoaWQzRnJhbWUudHlwZSA9PT0gJ1RYWFgnKSB7XG4gICAgICAgICAgICAgICAgICAgIHR4eHhGcmFtZSA9IElEM0RlY29kZXIuZGVjb2RlVHh4eEZyYW1lKGlkM0ZyYW1lKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGlkM0ZyYW1lLnR5cGUgPT09ICdQUklWJykge1xuICAgICAgICAgICAgICAgICAgICBwcml2RnJhbWUgPSBJRDNEZWNvZGVyLmRlY29kZVByaXZGcmFtZShpZDNGcmFtZSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChpZDNGcmFtZS50eXBlWzBdID09PSAnVCcpIHtcbiAgICAgICAgICAgICAgICAgICAgdGV4dEZyYW1lID0gSUQzRGVjb2Rlci5kZWNvZGVUZXh0RnJhbWUoaWQzRnJhbWUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChpZDNGcmFtZSkge1xuICAgICAgICAgICAgbGV0IGV2ZW50OiBJRDNUYWdFdmVudCA9IHsgY3VlOiBjdWUsIGZyYW1lOiBpZDNGcmFtZSB9O1xuICAgICAgICAgICAgc3VwZXIuZmlyZShJRDNIYW5kbGVyLkV2ZW50LklEM1RhZywgZXZlbnQpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHR4eHhGcmFtZSkge1xuICAgICAgICAgICAgbGV0IHR4eHhFdmVudDogVHh4eElEM0ZyYW1lRXZlbnQgPSB7IGN1ZTogY3VlLCBmcmFtZTogdHh4eEZyYW1lIH07XG4gICAgICAgICAgICBzdXBlci5maXJlKElEM0hhbmRsZXIuRXZlbnQuVHh4eElEM0ZyYW1lLCB0eHh4RXZlbnQpO1xuXG4gICAgICAgICAgICBpZiAodHh4eEZyYW1lLnZhbHVlKSB7XG4gICAgICAgICAgICAgICAgbGV0IHNsaWNlRGF0YSA9IHR4eHhGcmFtZS52YWx1ZS5zcGxpdCgnXycpO1xuICAgICAgICAgICAgICAgIGlmIChzbGljZURhdGEubGVuZ3RoID09IDMpIHtcbiAgICAgICAgICAgICAgICAgICAgbGV0IHNsaWNlRXZlbnQ6IFNsaWNlRXZlbnQgPSB7IGN1ZTogY3VlLCBhc3NldElkOiBzbGljZURhdGFbMF0sIHJheUNoYXI6IHNsaWNlRGF0YVsxXSwgc2xpY2VJbmRleDogcGFyc2VJbnQoc2xpY2VEYXRhWzJdLCAxNikgfTtcbiAgICAgICAgICAgICAgICAgICAgc3VwZXIuZmlyZShJRDNIYW5kbGVyLkV2ZW50LlNsaWNlRW50ZXJlZCwgc2xpY2VFdmVudCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHByaXZGcmFtZSkge1xuICAgICAgICAgICAgbGV0IHByaXZFdmVudDogUHJpdklEM0ZyYW1lRXZlbnQgPSB7IGN1ZTogY3VlLCBmcmFtZTogcHJpdkZyYW1lIH07XG4gICAgICAgICAgICBzdXBlci5maXJlKElEM0hhbmRsZXIuRXZlbnQuUHJpdklEM0ZyYW1lLCBwcml2RXZlbnQpO1xuICAgICAgICB9IGVsc2UgaWYgKHRleHRGcmFtZSkge1xuICAgICAgICAgICAgbGV0IHRleHRFdmVudDogVGV4dElEM0ZyYW1lRXZlbnQgPSB7IGN1ZTogY3VlLCBmcmFtZTogdGV4dEZyYW1lIH07XG4gICAgICAgICAgICBzdXBlci5maXJlKElEM0hhbmRsZXIuRXZlbnQuVGV4dElEM0ZyYW1lLCB0ZXh0RXZlbnQpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgc3RhdGljIGdldCBFdmVudCgpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIElEM1RhZzogJ2lkM1RhZycsXG4gICAgICAgICAgICBUeHh4SUQzRnJhbWU6ICd0eHh4SWQzRnJhbWUnLFxuICAgICAgICAgICAgUHJpdklEM0ZyYW1lOiAncHJpdklkM0ZyYW1lJyxcbiAgICAgICAgICAgIFRleHRJRDNGcmFtZTogJ3RleHRJZDNGcmFtZScsXG4gICAgICAgICAgICBTbGljZUVudGVyZWQ6ICdzbGljZUVudGVyZWQnXG4gICAgICAgIH07XG4gICAgfVxufSIsImltcG9ydCAqIGFzIHV0aWxzIGZyb20gJy4vdXRpbHMvdXRpbHMnO1xuXG5leHBvcnQgY2xhc3MgTGljZW5zZU1hbmFnZXJGUCB7XG4gICAgcHJpdmF0ZSBfdmlkZW86IEhUTUxWaWRlb0VsZW1lbnQ7XG4gICAgcHJpdmF0ZSBfY2VydGlmaWNhdGVQYXRoOiBzdHJpbmc7XG4gICAgcHJpdmF0ZSBfY2VydGlmaWNhdGVEYXRhOiBVaW50OEFycmF5O1xuXG4gICAgY29uc3RydWN0b3IodmlkZW86IEhUTUxWaWRlb0VsZW1lbnQpIHtcbiAgICAgICAgdGhpcy5fdmlkZW8gPSB2aWRlbztcbiAgICAgICAgdGhpcy5fY2VydGlmaWNhdGVQYXRoID0gbnVsbDtcbiAgICAgICAgdGhpcy5fY2VydGlmaWNhdGVEYXRhID0gbnVsbDtcblxuICAgICAgICBsZXQgc2VsZiA9IHRoaXM7XG4gICAgICAgIHRoaXMuX3ZpZGVvLmFkZEV2ZW50TGlzdGVuZXIoJ3dlYmtpdG5lZWRrZXknLCBmdW5jdGlvbihldmVudDogYW55KSB7IHNlbGYuX29uV2ViS2l0TmVlZEtleShldmVudC50YXJnZXQsIGV2ZW50LmluaXREYXRhKTsgfSk7XG4gICAgfVxuXG4gICAgcHVibGljIGxvYWQoY2VydGlmaWNhdGVQYXRoOiBzdHJpbmcpIHtcbiAgICAgICAgdGhpcy5fY2VydGlmaWNhdGVQYXRoID0gY2VydGlmaWNhdGVQYXRoO1xuICAgICAgICBpZiAodGhpcy5fY2VydGlmaWNhdGVQYXRoID09IG51bGwgfHwgdGhpcy5fY2VydGlmaWNhdGVQYXRoID09IFwiXCIpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJbTGljZW5zZU1hbmFnZXJGUF0gTm8gRmFpcnBsYXkgY2VydGlmaWNhdGUgcGF0aCBnaXZlbi4gQ2Fubm90IHBsYXkuXCIpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFdlYktpdE1lZGlhS2V5cyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiW0xpY2Vuc2VNYW5hZ2VyRlBdIE5vIEZhaXJwbGF5IGJyb3dzZXIgc3VwcG9ydCBkZXRlY3RlZC4gQ2Fubm90IHBsYXkuXCIpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgc2VsZiA9IHRoaXM7XG4gICAgICAgIGxldCB4aHIgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcbiAgICAgICAgeGhyLnJlc3BvbnNlVHlwZSA9ICdhcnJheWJ1ZmZlcic7XG4gICAgICAgIHhoci5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBpZiAoeGhyLnJlYWR5U3RhdGUgPT09IDQpIHtcbiAgICAgICAgICAgICAgICBpZiAoeGhyLnN0YXR1cyA9PT0gMjAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYub25DZXJ0aWZpY2F0ZUxvYWRlZCh4aHIucmVzcG9uc2UpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93ICdbTGljZW5zZU1hbmFnZXJGUF0gLSBGYWlsZWQgdG8gcmV0cmlldmUgdGhlIHNlcnZlciBjZXJ0aWZpY2F0ZSAoJyArIHNlbGYuX2NlcnRpZmljYXRlUGF0aCArICcpLiBTdGF0dXM6ICcgKyB4aHIuc3RhdHVzICsgJyAoJyArIHhoci5zdGF0dXNUZXh0ICsgJyknO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgeGhyLm9wZW4oJ0dFVCcsIHRoaXMuX2NlcnRpZmljYXRlUGF0aCwgdHJ1ZSk7XG4gICAgICAgIHhoci5zZXRSZXF1ZXN0SGVhZGVyKCdQcmFnbWEnLCAnQ2FjaGUtQ29udHJvbDogbm8tY2FjaGUnKTtcbiAgICAgICAgeGhyLnNldFJlcXVlc3RIZWFkZXIoXCJDYWNoZS1Db250cm9sXCIsIFwibWF4LWFnZT0wXCIpO1xuICAgICAgICB4aHIuc2VuZCgpO1xuICAgIH1cblxuICAgIHByaXZhdGUgb25DZXJ0aWZpY2F0ZUxvYWRlZChkYXRhOiBBcnJheUJ1ZmZlcik6IHZvaWQge1xuICAgICAgICB0aGlzLl9jZXJ0aWZpY2F0ZURhdGEgPSBuZXcgVWludDhBcnJheShkYXRhKTtcbiAgICAgICAgY29uc29sZS5sb2coXCJbTGljZW5zZU1hbmFnZXJGUF0gQ2VydGlmaWNhdGUgbG9hZGVkIHN1Y2Nlc3NmdWxseVwiKTtcblxuICAgICAgICAvLyB0aGlzLl92aWRlby5zcmMgYWxyZWFkeSBzZXQgaW4gTmF0aXZlUGxheWVyIGNsYXNzXG4gICAgICAgIHRoaXMuX3ZpZGVvLmxvYWQoKTtcbiAgICB9XG5cbiAgICAvLyB1c2UgYHZpZGVvOiBhbnlgIGluc3RlYWQgb2YgYHZpZGVvOiBIVE1MVmlkZW9FbGVtZW50YCBiZWNhdXNlIHR5cGVzY3JpcHQgY29tcGxhaW5zIGFib3V0IHdlYmtpdCogc3R1ZmZcbiAgICBwcml2YXRlIF9vbldlYktpdE5lZWRLZXkodmlkZW86IGFueSwgaW5pdERhdGE6IFVpbnQxNkFycmF5KTogdm9pZCB7XG4gICAgICAgIGlmIChpbml0RGF0YSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaXJwbGF5IERSTSBuZWVkcyBhIGtleSwgYnV0IG5vIGluaXQgZGF0YSBhdmFpbGFibGUuXCIpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLl9jZXJ0aWZpY2F0ZURhdGEgPT09IG51bGwpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlycGxheSBEUk0gbmVlZHMgYSBrZXksIGJ1dCBubyBjZXJ0aWZpY2F0ZSBkYXRhIGF2YWlsYWJsZS5cIik7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgZGVzdFVybCA9IHRoaXMuZ2V0U1BDVXJsKGluaXREYXRhKTtcbiAgICAgICAgbGV0IGNvbnRlbnREYXRhID0gdGhpcy5leHRyYWN0Q29udGVudElkKGRlc3RVcmwpO1xuICAgICAgICBsZXQgc2Vzc2lvbkRhdGEgPSB0aGlzLmNvbmNhdEluaXREYXRhSWRBbmRDZXJ0aWZpY2F0ZShpbml0RGF0YSwgY29udGVudERhdGEpO1xuXG4gICAgICAgIGlmICghdmlkZW8ud2Via2l0S2V5cykge1xuICAgICAgICAgICAgbGV0IGtleVN5c3RlbSA9IHRoaXMuc2VsZWN0S2V5U3lzdGVtKCk7XG4gICAgICAgICAgICB2aWRlby53ZWJraXRTZXRNZWRpYUtleXMobmV3IFdlYktpdE1lZGlhS2V5cyhrZXlTeXN0ZW0pKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghdmlkZW8ud2Via2l0S2V5cylcbiAgICAgICAgICAgIHRocm93IFwiQ291bGQgbm90IGNyZWF0ZSBNZWRpYUtleXNcIjtcblxuICAgICAgICBsZXQga2V5U2Vzc2lvbiA9IHZpZGVvLndlYmtpdEtleXMuY3JlYXRlU2Vzc2lvbihcInZpZGVvL21wNFwiLCBzZXNzaW9uRGF0YSk7XG4gICAgICAgIGlmICgha2V5U2Vzc2lvbilcbiAgICAgICAgICAgIHRocm93IFwiQ291bGQgbm90IGNyZWF0ZSBrZXkgc2Vzc2lvblwiO1xuICAgICAgICBrZXlTZXNzaW9uLmNvbnRlbnRJZCA9IGNvbnRlbnREYXRhO1xuICAgICAgICBrZXlTZXNzaW9uLmRlc3RpbmF0aW9uVVJMID0gZGVzdFVybDtcbiAgICAgICAgbGV0IHNlbGYgPSB0aGlzO1xuICAgICAgICBrZXlTZXNzaW9uLmFkZEV2ZW50TGlzdGVuZXIoJ3dlYmtpdGtleW1lc3NhZ2UnLCBmdW5jdGlvbiAoZXZlbnQ6IGFueSkge1xuICAgICAgICAgICAgc2VsZi5saWNlbnNlUmVxdWVzdFJlYWR5KGV2ZW50LnRhcmdldCwgZXZlbnQubWVzc2FnZSk7XG4gICAgICAgIH0pO1xuICAgICAgICBrZXlTZXNzaW9uLmFkZEV2ZW50TGlzdGVuZXIoJ3dlYmtpdGtleWFkZGVkJywgZnVuY3Rpb24gKGV2ZW50OiBhbnkpIHsgc2VsZi5vbmtleWFkZGVkKCk7IH0pO1xuICAgICAgICBrZXlTZXNzaW9uLmFkZEV2ZW50TGlzdGVuZXIoJ3dlYmtpdGtleWVycm9yJywgZnVuY3Rpb24gKGV2ZW50OiBhbnkpIHsgc2VsZi5vbmtleWVycm9yKCk7IH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgZXh0cmFjdENvbnRlbnRJZChzcGNVcmw6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgICAgIC8vIGNvbnRlbnRJZCBpcyBwYXNzZWQgdXAgYXMgYSBVUkksIGZyb20gd2hpY2ggdGhlIGhvc3QgbXVzdCBiZSBleHRyYWN0ZWQ6XG4gICAgICAgIGxldCBsaW5rID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpO1xuICAgICAgICBsaW5rLmhyZWYgPSBzcGNVcmw7XG4gICAgICAgIGxldCBxdWVyeSA9IGxpbmsuc2VhcmNoLnN1YnN0cigxKTtcbiAgICAgICAgbGV0IGlkID0gcXVlcnkuc3BsaXQoXCImXCIpO1xuICAgICAgICBsZXQgaXRlbSA9IGlkWzBdLnNwbGl0KFwiPVwiKTtcbiAgICAgICAgbGV0IGNpZCA9IGl0ZW1bMV07XG4gICAgICAgIHJldHVybiBjaWQ7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBnZXRTUENVcmwoaW5pdERhdGE6IFVpbnQxNkFycmF5KTogc3RyaW5nIHtcbiAgICAgICAgbGV0IHNrZHVybCA9IHV0aWxzLmFycmF5MTZUb1N0cmluZyhpbml0RGF0YSk7XG4gICAgICAgIC8vIGNvbnRlbnRJZCBpcyBwYXNzZWQgdXAgYXMgYSBVUkksIGZyb20gd2hpY2ggdGhlIGhvc3QgbXVzdCBiZSBleHRyYWN0ZWQ6XG4gICAgICAgIGxldCBzcGN1cmwgPSBza2R1cmwucmVwbGFjZSgnc2tkOi8vJywgJ2h0dHBzOi8vJyk7XG4gICAgICAgIHNwY3VybCA9IHNwY3VybC5zdWJzdHJpbmcoMSwgc3BjdXJsLmxlbmd0aCk7XG4gICAgICAgIHJldHVybiBzcGN1cmw7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBjb25jYXRJbml0RGF0YUlkQW5kQ2VydGlmaWNhdGUoaW5pdERhdGE6IFVpbnQxNkFycmF5LCBpZDogYW55KTogVWludDhBcnJheSB7XG4gICAgICAgIGlmICh0eXBlb2YgaWQgPT0gXCJzdHJpbmdcIilcbiAgICAgICAgICAgIGlkID0gdXRpbHMuc3RyaW5nVG9BcnJheTE2KGlkKTtcbiAgICAgICAgLy8gbGF5b3V0IGlzIFtpbml0RGF0YV1bNCBieXRlOiBpZExlbmd0aF1baWRMZW5ndGggYnl0ZTogaWRdWzQgYnl0ZTpjZXJ0TGVuZ3RoXVtjZXJ0TGVuZ3RoIGJ5dGU6IGNlcnRdXG4gICAgICAgIGxldCBvZmZzZXQgPSAwO1xuICAgICAgICBsZXQgYnVmZmVyID0gbmV3IEFycmF5QnVmZmVyKGluaXREYXRhLmJ5dGVMZW5ndGggKyA0ICsgaWQuYnl0ZUxlbmd0aCArIDQgKyB0aGlzLl9jZXJ0aWZpY2F0ZURhdGEuYnl0ZUxlbmd0aCk7XG4gICAgICAgIGxldCBkYXRhVmlldyA9IG5ldyBEYXRhVmlldyhidWZmZXIpO1xuXG4gICAgICAgIGxldCBpbml0RGF0YUFycmF5ID0gbmV3IFVpbnQ4QXJyYXkoYnVmZmVyLCBvZmZzZXQsIGluaXREYXRhLmJ5dGVMZW5ndGgpO1xuICAgICAgICBpbml0RGF0YUFycmF5LnNldChpbml0RGF0YSk7XG4gICAgICAgIG9mZnNldCArPSBpbml0RGF0YS5ieXRlTGVuZ3RoO1xuXG4gICAgICAgIGRhdGFWaWV3LnNldFVpbnQzMihvZmZzZXQsIGlkLmJ5dGVMZW5ndGgsIHRydWUpO1xuICAgICAgICBvZmZzZXQgKz0gNDtcblxuICAgICAgICBsZXQgaWRBcnJheSA9IG5ldyBVaW50OEFycmF5KGJ1ZmZlciwgb2Zmc2V0LCBpZC5ieXRlTGVuZ3RoKTtcbiAgICAgICAgaWRBcnJheS5zZXQoaWQpO1xuICAgICAgICBvZmZzZXQgKz0gaWRBcnJheS5ieXRlTGVuZ3RoO1xuXG4gICAgICAgIGRhdGFWaWV3LnNldFVpbnQzMihvZmZzZXQsIHRoaXMuX2NlcnRpZmljYXRlRGF0YS5ieXRlTGVuZ3RoLCB0cnVlKTtcbiAgICAgICAgb2Zmc2V0ICs9IDQ7XG5cbiAgICAgICAgbGV0IGNlcnRBcnJheSA9IG5ldyBVaW50OEFycmF5KGJ1ZmZlciwgb2Zmc2V0LCB0aGlzLl9jZXJ0aWZpY2F0ZURhdGEuYnl0ZUxlbmd0aCk7XG4gICAgICAgIGNlcnRBcnJheS5zZXQodGhpcy5fY2VydGlmaWNhdGVEYXRhKTtcblxuICAgICAgICByZXR1cm4gbmV3IFVpbnQ4QXJyYXkoYnVmZmVyLCAwLCBidWZmZXIuYnl0ZUxlbmd0aCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBzZWxlY3RLZXlTeXN0ZW0oKTogc3RyaW5nIHtcbiAgICAgICAgaWYgKFdlYktpdE1lZGlhS2V5cy5pc1R5cGVTdXBwb3J0ZWQoXCJjb20uYXBwbGUuZnBzLjFfMFwiLCBcInZpZGVvL21wNFwiKSkge1xuICAgICAgICAgICAgcmV0dXJuIFwiY29tLmFwcGxlLmZwcy4xXzBcIjtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRocm93IFwiS2V5IFN5c3RlbSBub3Qgc3VwcG9ydGVkXCI7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGxpY2Vuc2VSZXF1ZXN0UmVhZHkoc2Vzc2lvbjogYW55LCBtZXNzYWdlOiBhbnkpOiB2b2lkIHtcbiAgICAgICAgbGV0IHNlbGYgPSB0aGlzO1xuICAgICAgICBsZXQgeGhyID0gbmV3IFhNTEh0dHBSZXF1ZXN0KCk7XG4gICAgICAgIHhoci5yZXNwb25zZVR5cGUgPSAnanNvbic7XG4gICAgICAgICh4aHIgYXMgYW55KS5zZXNzaW9uID0gc2Vzc2lvbjtcbiAgICAgICAgeGhyLm9ucmVhZHlzdGF0ZWNoYW5nZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGlmICh4aHIucmVhZHlTdGF0ZSA9PT0gNCkge1xuICAgICAgICAgICAgICAgIGlmICh4aHIuc3RhdHVzID09PSAyMDApIHtcbiAgICAgICAgICAgICAgICAgICAgc2VsZi5saWNlbnNlUmVxdWVzdExvYWRlZCh4aHIucmVzcG9uc2UsICh4aHIgYXMgYW55KS5zZXNzaW9uKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBsZXQgZXggPSBKU09OLnN0cmluZ2lmeShzZXNzaW9uLnJlc3BvbnNlKTtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgJ1tMaWNlbnNlTWFuYWdlckZQXSBsaWNlbnNlIHJlcXVlc3QgZmFpbGVkICcgKyAoZXggPyBleCA6ICcnKSArICcoJyArIHNlc3Npb24uZGVzdGluYXRpb25VUkwgKyAnKS4gU3RhdHVzOiAnICsgeGhyLnN0YXR1cyArICcgKCcgKyB4aHIuc3RhdHVzVGV4dCArICcpJztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgbGV0IHBheWxvYWQ6IGFueSA9IHt9O1xuICAgICAgICBwYXlsb2FkW1wic3BjXCJdID0gdXRpbHMuYmFzZTY0RW5jb2RlVWludDhBcnJheShtZXNzYWdlKTtcbiAgICAgICAgcGF5bG9hZFtcImFzc2V0SWRcIl0gPSBzZXNzaW9uLmNvbnRlbnRJZDtcbiAgICAgICAgeGhyLm9wZW4oJ1BPU1QnLCBzZXNzaW9uLmRlc3RpbmF0aW9uVVJMLCB0cnVlKTtcbiAgICAgICAgeGhyLnNlbmQoSlNPTi5zdHJpbmdpZnkocGF5bG9hZCkpO1xuXG4gICAgICAgIHdpbmRvdy5jb25zb2xlLmxvZyhcIltMaWNlbnNlTWFuYWdlckZQXSBGYWlycGxheSBrZXkgcmVxdWVzdGVkIGZvciBhc3NldCBcIiArIHNlc3Npb24uY29udGVudElkKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGxpY2Vuc2VSZXF1ZXN0TG9hZGVkKGRhdGE6IGFueSwgc2Vzc2lvbjogYW55KTogdm9pZCB7XG4gICAgICAgIGxldCBrZXkgPSB1dGlscy5iYXNlNjREZWNvZGVVaW50OEFycmF5KGRhdGFbJ2NrYyddKTtcbiAgICAgICAgc2Vzc2lvbi51cGRhdGUoa2V5KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIG9ua2V5ZXJyb3IoKTogdm9pZCB7XG4gICAgICAgIHdpbmRvdy5jb25zb2xlLmVycm9yKCdbTGljZW5zZU1hbmFnZXJGUF0gRmFpcnBsYXkgZGVjcnlwdGlvbiBrZXkgZXJyb3Igd2FzIGVuY291bnRlcmVkJyk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBvbmtleWFkZGVkKCk6IHZvaWQge1xuICAgICAgICB3aW5kb3cuY29uc29sZS5sb2coJ1tMaWNlbnNlTWFuYWdlckZQXSBGYWlycGxheSBkZWNyeXB0aW9uIGtleSB3YXMgYWRkZWQgdG8gc2Vzc2lvbi4nKTtcbiAgICB9XG59XG4iLCJpbXBvcnQgKiBhcyB1dGlscyBmcm9tICcuL3V0aWxzL3V0aWxzJztcblxuZXhwb3J0IGNsYXNzIExpY2Vuc2VNYW5hZ2VyIHtcblxuICAgIHJlYWRvbmx5IExJQ0VOU0VfVFlQRV9XSURFVklORSA9IFwiZWRlZjhiYTktNzlkNi00YWNlLWEzYzgtMjdkY2Q1MWQyMWVkXCI7XG4gICAgcmVhZG9ubHkgTElDRU5TRV9UWVBFX1BMQVlSRUFEWSA9IFwiOWEwNGYwNzktOTg0MC00Mjg2LWFiOTItZTY1YmUwODg1Zjk1XCI7XG5cbiAgICBwcml2YXRlIF92aWRlbzogSFRNTFZpZGVvRWxlbWVudDtcbiAgICBwcml2YXRlIF9hZGFwdGl2ZVNvdXJjZTogTW9kdWxlLkFkYXB0aXZlU291cmNlO1xuXG4gICAgcHJpdmF0ZSBfa2V5U2VydmVyUHJlZml4OiBzdHJpbmc7XG4gICAgcHJpdmF0ZSBfbGljZW5zZVR5cGUgPSBcIlwiO1xuICAgIHByaXZhdGUgX3Bzc2g6IFVpbnQ4QXJyYXk7XG4gICAgcHJpdmF0ZSBfbWVkaWFLZXlzOiBNZWRpYUtleXM7XG4gICAgcHJpdmF0ZSBfa2V5UmVxdWVzdHM6IHsgd2lkZXZpbmU6IHN0cmluZywgcGxheXJlYWR5OiBzdHJpbmcgfVtdO1xuICAgIHByaXZhdGUgX3BlbmRpbmdLZXlSZXF1ZXN0czogeyB3aWRldmluZTogc3RyaW5nLCBwbGF5cmVhZHk6IHN0cmluZyB9W107XG5cbiAgICBwdWJsaWMgcGxheXJlYWR5S2V5U3lzdGVtID0ge1xuICAgICAgICBrZXlTeXN0ZW06ICdjb20ubWljcm9zb2Z0LnBsYXlyZWFkeScsXG4gICAgICAgIHN1cHBvcnRlZENvbmZpZzogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGluaXREYXRhVHlwZXM6IFsna2V5aWRzJywgJ2NlbmMnXSxcbiAgICAgICAgICAgICAgICBhdWRpb0NhcGFiaWxpdGllczpcbiAgICAgICAgICAgICAgICAgICAgW1xuICAgICAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRlbnRUeXBlOiAnYXVkaW8vbXA0OyBjb2RlY3M9XCJtcDRhXCInLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJvYnVzdG5lc3M6ICcnXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgdmlkZW9DYXBhYmlsaXRpZXM6XG4gICAgICAgICAgICAgICAgICAgIFtcbiAgICAgICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb250ZW50VHlwZTogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMVwiJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByb2J1c3RuZXNzOiAnJ1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9XG4gICAgICAgIF1cbiAgICB9O1xuXG4gICAgcHVibGljIHdpZGV2aW5lS2V5U3lzdGVtID0ge1xuICAgICAgICBrZXlTeXN0ZW06ICdjb20ud2lkZXZpbmUuYWxwaGEnLFxuICAgICAgICBzdXBwb3J0ZWRDb25maWc6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBsYWJlbDogJ2ZvbycsXG4gICAgICAgICAgICAgICAgaW5pdERhdGFUeXBlczogWydjZW5jJ10sXG4gICAgICAgICAgICAgICAgc2Vzc2lvblR5cGVzOiBbJ3RlbXBvcmFyeSddLFxuICAgICAgICAgICAgICAgIGF1ZGlvQ2FwYWJpbGl0aWVzOlxuICAgICAgICAgICAgICAgICAgICBbXG4gICAgICAgICAgICAgICAgICAgICAgICB7IGNvbnRlbnRUeXBlOiAnYXVkaW8vbXA0OyBjb2RlY3M9XCJtcDRhLjQwLjVcIicsIHJvYnVzdG5lc3M6ICdTV19TRUNVUkVfQ1JZUFRPJyB9XG4gICAgICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgdmlkZW9DYXBhYmlsaXRpZXM6XG4gICAgICAgICAgICAgICAgICAgIFtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHJvYnVzdG5lc3MgSFdfU0VDVVJFX0FMTCwgSFdfU0VDVVJFX0RFQ09ERSwgSFdfU0VDVVJFX0NSWVBUTywgU1dfU0VDVVJFX0RFQ09ERSwgU1dfU0VDVVJFX0NSWVBUT1xuICAgICAgICAgICAgICAgICAgICAgICAgeyBjb250ZW50VHlwZTogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40ZDAwMWZcIicsIHJvYnVzdG5lc3M6ICdIV19TRUNVUkVfQUxMJyB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgeyBjb250ZW50VHlwZTogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40ZDAwMWZcIicsIHJvYnVzdG5lc3M6ICdIV19TRUNVUkVfREVDT0RFJyB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgeyBjb250ZW50VHlwZTogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40ZDAwMWZcIicsIHJvYnVzdG5lc3M6ICdIV19TRUNVUkVfQ1JZUFRPJyB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgeyBjb250ZW50VHlwZTogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40ZDAwMWZcIicsIHJvYnVzdG5lc3M6ICdTV19TRUNVUkVfREVDT0RFJyB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgeyBjb250ZW50VHlwZTogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40ZDAwMWZcIicsIHJvYnVzdG5lc3M6ICdTV19TRUNVUkVfQ1JZUFRPJyB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgeyBjb250ZW50VHlwZTogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40ZDAwMWVcIicsIHJvYnVzdG5lc3M6ICdIV19TRUNVUkVfQUxMJyB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgeyBjb250ZW50VHlwZTogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40ZDAwMWVcIicsIHJvYnVzdG5lc3M6ICdTV19TRUNVUkVfQ1JZUFRPJyB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgeyBjb250ZW50VHlwZTogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40ZDAwMTZcIicsIHJvYnVzdG5lc3M6ICdIV19TRUNVUkVfQUxMJyB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgeyBjb250ZW50VHlwZTogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40ZDAwMTZcIicsIHJvYnVzdG5lc3M6ICdTV19TRUNVUkVfQ1JZUFRPJyB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgeyBjb250ZW50VHlwZTogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40MjAwMGRcIicsIHJvYnVzdG5lc3M6ICdIV19TRUNVUkVfQUxMJyB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgeyBjb250ZW50VHlwZTogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40MjAwMGRcIicsIHJvYnVzdG5lc3M6ICdTV19TRUNVUkVfQ1JZUFRPJyB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgeyBjb250ZW50VHlwZTogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40MjAwMGNcIicsIHJvYnVzdG5lc3M6ICdIV19TRUNVUkVfQUxMJyB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgeyBjb250ZW50VHlwZTogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40MjAwMGNcIicsIHJvYnVzdG5lc3M6ICdTV19TRUNVUkVfQ1JZUFRPJyB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgeyBjb250ZW50VHlwZTogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40MjAwMGJcIicsIHJvYnVzdG5lc3M6ICdIV19TRUNVUkVfQUxMJyB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgeyBjb250ZW50VHlwZTogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40MjAwMGJcIicsIHJvYnVzdG5lc3M6ICdTV19TRUNVUkVfQ1JZUFRPJyB9LFxuICAgICAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9XG4gICAgICAgIF1cbiAgICB9O1xuXG4gICAgY29uc3RydWN0b3IodmlkZW86IEhUTUxWaWRlb0VsZW1lbnQsIGFkYXB0aXZlU291cmNlOiBNb2R1bGUuQWRhcHRpdmVTb3VyY2UpIHtcbiAgICAgICAgLy8gICAgY29uc29sZS5sb2coXCJMaWNlbnNlTWFuYWdlciBDVE9SXCIpO1xuICAgICAgICB0aGlzLl92aWRlbyA9IHZpZGVvO1xuICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZSA9IGFkYXB0aXZlU291cmNlO1xuICAgICAgICB0aGlzLl9rZXlTZXJ2ZXJQcmVmaXggPSBudWxsO1xuICAgICAgICB0aGlzLl9wc3NoID0gbnVsbDtcbiAgICAgICAgdGhpcy5fbWVkaWFLZXlzID0gbnVsbDtcbiAgICAgICAgdGhpcy5fa2V5UmVxdWVzdHMgPSBbXTtcbiAgICAgICAgdGhpcy5fcGVuZGluZ0tleVJlcXVlc3RzID0gW107XG4gICAgICAgIHRoaXMuaW5pdE1lZGlhS2V5cygpO1xuICAgIH1cblxuICAgIHB1YmxpYyBhZGRMaWNlbnNlUmVxdWVzdChkcm1JbmZvOiB7IHdpZGV2aW5lOiBzdHJpbmcsIHBsYXlyZWFkeTogc3RyaW5nIH0pIHtcbiAgICAgICAgLy8gICAgY29uc29sZS5sb2coXCJMaWNlbnNlTWFuYWdlciAtIEdvdCBsaWNlbnNlIHJlcXVlc3QgZm9yIERSTSBwbGF5YmFjayAlb1wiLCBkcm1JbmZvKTtcblxuICAgICAgICAvLyBjaGVjayBpZiBhbHJlYWR5IHJlcXVlc3RlZFxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX2tleVJlcXVlc3RzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBpZiAoZHJtSW5mby53aWRldmluZSA9PT0gdGhpcy5fa2V5UmVxdWVzdHNbaV0ud2lkZXZpbmUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gY2hlY2sgaWYgYWxyZWFkeSBwZW5kaW5nXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fcGVuZGluZ0tleVJlcXVlc3RzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBpZiAoZHJtSW5mby53aWRldmluZSA9PT0gdGhpcy5fcGVuZGluZ0tleVJlcXVlc3RzW2ldLndpZGV2aW5lKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gZWxzZSwgcmVxdWVzdCBpdFxuICAgICAgICB0aGlzLl9wZW5kaW5nS2V5UmVxdWVzdHMucHVzaChkcm1JbmZvKTtcbiAgICAgICAgdGhpcy5wcm9jZXNzUGVuZGluZ0tleXModGhpcyk7XG4gICAgfVxuXG4gICAgcHVibGljIHNldEtleVNlcnZlclByZWZpeChrZXlTZXJ2ZXJQcmVmaXg6IHN0cmluZykge1xuICAgICAgICAvLyAgICBjb25zb2xlLmxvZyhcIktleVNlcnZlclByZWZpeDogXCIgKyBrZXlTZXJ2ZXJQcmVmaXgpO1xuICAgICAgICB0aGlzLl9rZXlTZXJ2ZXJQcmVmaXggPSBrZXlTZXJ2ZXJQcmVmaXg7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBpbml0TWVkaWFLZXlzKCkge1xuICAgICAgICAvLyAgICBjb25zb2xlLmxvZyhcIltpbml0TWVkaWFLZXlzXVwiKTtcbiAgICAgICAgbGV0IHNlbGYgPSB0aGlzO1xuICAgICAgICB0aGlzLl9tZWRpYUtleXMgPSBudWxsO1xuXG4gICAgICAgIGlmIChuYXZpZ2F0b3IucmVxdWVzdE1lZGlhS2V5U3lzdGVtQWNjZXNzKSB7XG4gICAgICAgICAgICBuYXZpZ2F0b3IucmVxdWVzdE1lZGlhS2V5U3lzdGVtQWNjZXNzKHNlbGYud2lkZXZpbmVLZXlTeXN0ZW0ua2V5U3lzdGVtLCBzZWxmLndpZGV2aW5lS2V5U3lzdGVtLnN1cHBvcnRlZENvbmZpZylcbiAgICAgICAgICAgICAgICAudGhlbihmdW5jdGlvbiAoa2V5U3lzdGVtQWNjZXNzKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYuX2xpY2Vuc2VUeXBlID0gc2VsZi5MSUNFTlNFX1RZUEVfV0lERVZJTkU7XG4gICAgICAgICAgICAgICAgICAgIGtleVN5c3RlbUFjY2Vzcy5jcmVhdGVNZWRpYUtleXMoKVxuICAgICAgICAgICAgICAgICAgICAgICAgLnRoZW4oZnVuY3Rpb24gKGNyZWF0ZWRNZWRpYUtleXMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWxmLm9uTWVkaWFLZXlBY3F1aXJlZChzZWxmLCBjcmVhdGVkTWVkaWFLZXlzKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICBuYXZpZ2F0b3IucmVxdWVzdE1lZGlhS2V5U3lzdGVtQWNjZXNzKHNlbGYucGxheXJlYWR5S2V5U3lzdGVtLmtleVN5c3RlbSwgc2VsZi5wbGF5cmVhZHlLZXlTeXN0ZW0uc3VwcG9ydGVkQ29uZmlnKVxuICAgICAgICAgICAgICAgICAgICAgICAgLnRoZW4oZnVuY3Rpb24gKGtleVN5c3RlbUFjY2Vzcykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYuX2xpY2Vuc2VUeXBlID0gc2VsZi5MSUNFTlNFX1RZUEVfUExBWVJFQURZO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGtleVN5c3RlbUFjY2Vzcy5jcmVhdGVNZWRpYUtleXMoKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAudGhlbihmdW5jdGlvbiAoY3JlYXRlZE1lZGlhS2V5cykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5vbk1lZGlhS2V5QWNxdWlyZWQoc2VsZiwgY3JlYXRlZE1lZGlhS2V5cyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICAgICAgLmNhdGNoKGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWxmLl9hZGFwdGl2ZVNvdXJjZS5zaWduYWxEcm1FcnJvcignTGljZW5zZU1hbmFnZXIgLSBZb3VyIGJyb3dzZXIvc3lzdGVtIGRvZXMgbm90IHN1cHBvcnQgdGhlIHJlcXVlc3RlZCBjb25maWd1cmF0aW9ucyBmb3IgcGxheWluZyBwcm90ZWN0ZWQgY29udGVudC4nKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLmNhdGNoKGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgc2VsZi5fYWRhcHRpdmVTb3VyY2Uuc2lnbmFsRHJtRXJyb3IoJ0xpY2Vuc2VNYW5hZ2VyIC0gWW91ciBicm93c2VyL3N5c3RlbSBkb2VzIG5vdCBzdXBwb3J0IHRoZSByZXF1ZXN0ZWQgY29uZmlndXJhdGlvbnMgZm9yIHBsYXlpbmcgcHJvdGVjdGVkIGNvbnRlbnQuJyk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIG9uTWVkaWFLZXlBY3F1aXJlZChzZWxmOiBMaWNlbnNlTWFuYWdlciwgY3JlYXRlZE1lZGlhS2V5czogTWVkaWFLZXlzKSB7XG4gICAgICAgIC8vICAgIGNvbnNvbGUubG9nKFwiW29uTWVkaWFLZXlBY3F1aXJlZF1cIik7XG5cbiAgICAgICAgc2VsZi5fbWVkaWFLZXlzID0gY3JlYXRlZE1lZGlhS2V5cztcbiAgICAgICAgc2VsZi5fdmlkZW8uc2V0TWVkaWFLZXlzKHNlbGYuX21lZGlhS2V5cyk7XG4gICAgICAgIHNlbGYucHJvY2Vzc1BlbmRpbmdLZXlzKHNlbGYpO1xuICAgIH1cblxuICAgIHByaXZhdGUgcHJvY2Vzc1BlbmRpbmdLZXlzKHNlbGY6IExpY2Vuc2VNYW5hZ2VyKSB7XG4gICAgICAgIC8vICAgIGNvbnNvbGUubG9nKFwiW3Byb2Nlc3NQZW5kaW5nS2V5c11cIik7XG5cbiAgICAgICAgLy8gbWVkaWFLZXlzIG1heSBub3QgYmUgYXZhaWxhYmxlIHlldFxuICAgICAgICBpZiAoc2VsZi5fbWVkaWFLZXlzID09PSBudWxsKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB3aGlsZSAoc2VsZi5fcGVuZGluZ0tleVJlcXVlc3RzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGxldCBkcm1JdGVtID0gc2VsZi5fcGVuZGluZ0tleVJlcXVlc3RzLnNoaWZ0KCk7IC8vIHBvcCBmaXJzdCBlbGVtZW50XG4gICAgICAgICAgICB0aGlzLl9rZXlSZXF1ZXN0cy5wdXNoKGRybUl0ZW0pO1xuICAgICAgICAgICAgY29uc29sZS5sb2coXCJMaWNlbnNlTWFuYWdlciAtIHN0YXJ0aW5nIGxpY2Vuc2UgdXBkYXRlIGZvciBEUk0gcGxheWJhY2tcIik7XG4gICAgICAgICAgICBpZiAoc2VsZi5fbGljZW5zZVR5cGUgPT09IHRoaXMuTElDRU5TRV9UWVBFX1dJREVWSU5FKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5nZXROZXdLZXlTZXNzaW9uKHV0aWxzLmJhc2U2NFRvQnVmZmVyKGRybUl0ZW0ud2lkZXZpbmUpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKHNlbGYuX2xpY2Vuc2VUeXBlID09PSB0aGlzLkxJQ0VOU0VfVFlQRV9QTEFZUkVBRFkpIHtcbiAgICAgICAgICAgICAgICBzZWxmLmdldE5ld0tleVNlc3Npb24odXRpbHMuYmFzZTY0VG9CdWZmZXIoZHJtSXRlbS5wbGF5cmVhZHkpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgZ2V0TmV3S2V5U2Vzc2lvbihpbml0RGF0YTogVWludDhBcnJheSkge1xuICAgICAgICAvLyAgICBjb25zb2xlLmxvZyhcIltnZXROZXdLZXlTZXNzaW9uXVwiKTtcblxuICAgICAgICBsZXQgc2VsZiA9IHRoaXM7XG4gICAgICAgIGxldCBrZXlTZXNzaW9uID0gc2VsZi5fbWVkaWFLZXlzLmNyZWF0ZVNlc3Npb24oXCJ0ZW1wb3JhcnlcIik7XG4gICAgICAgIGtleVNlc3Npb24uYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIGZ1bmN0aW9uIChldmVudDogTWVkaWFLZXlNZXNzYWdlRXZlbnQpIHtcbiAgICAgICAgICAgIC8vY29uc29sZS5sb2coJ29ubWVzc2FnZSAsIG1lc3NhZ2UgdHlwZTogJyArIGV2ZW50Lm1lc3NhZ2VUeXBlKTtcblxuICAgICAgICAgICAgc2VsZi5kb3dubG9hZE5ld0tleShzZWxmLmdldExpY2Vuc2VVcmwoKSwgZXZlbnQubWVzc2FnZSwgZnVuY3Rpb24gKGRhdGE6IEFycmF5QnVmZmVyKSB7XG5cbiAgICAgICAgICAgICAgICAvLyBjb25zb2xlLmxvZygnZXZlbnQudGFyZ2V0LnVwZGF0ZSwgZGF0YSBieXRlczogJyArIGRhdGEuYnl0ZUxlbmd0aCk7XG5cbiAgICAgICAgICAgICAgICB2YXIgcHJvbSA9IDxQcm9taXNlPHZvaWQ+Pig8TWVkaWFLZXlTZXNzaW9uPmV2ZW50LnRhcmdldCkudXBkYXRlKGRhdGEpO1xuICAgICAgICAgICAgICAgIHByb20uY2F0Y2goZnVuY3Rpb24gKGU6IHN0cmluZykge1xuICAgICAgICAgICAgICAgICAgICBzZWxmLl9hZGFwdGl2ZVNvdXJjZS5zaWduYWxEcm1FcnJvcignTGljZW5zZU1hbmFnZXIgLSBjYWxsIHRvIE1lZGlhS2V5U2Vzc2lvbi51cGRhdGUoKSBmYWlsZWQ6ICcgKyBlKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIkxpY2Vuc2VNYW5hZ2VyIC0gZmluaXNoZWQgbGljZW5zZSB1cGRhdGUgZm9yIERSTSBwbGF5YmFja1wiKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9LCBmYWxzZSk7XG5cbiAgICAgICAgbGV0IHJlcVByb21pc2UgPSA8UHJvbWlzZTx2b2lkPj5rZXlTZXNzaW9uLmdlbmVyYXRlUmVxdWVzdCgnY2VuYycsIGluaXREYXRhKTtcbiAgICAgICAgcmVxUHJvbWlzZS5jYXRjaChmdW5jdGlvbiAoZTogc3RyaW5nKSB7XG4gICAgICAgICAgICBzZWxmLl9hZGFwdGl2ZVNvdXJjZS5zaWduYWxEcm1FcnJvcignTGljZW5zZU1hbmFnZXIgLSBrZXlTZXNzaW9uLmdlbmVyYXRlUmVxdWVzdCgpIGZhaWxlZDogJyArIGUpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGdldExpY2Vuc2VVcmwoKSB7XG4gICAgICAgIGlmICh0aGlzLl9saWNlbnNlVHlwZSA9PT0gdGhpcy5MSUNFTlNFX1RZUEVfUExBWVJFQURZKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fa2V5U2VydmVyUHJlZml4ICsgXCIvcHJcIjtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICh0aGlzLl9saWNlbnNlVHlwZSA9PT0gdGhpcy5MSUNFTlNFX1RZUEVfV0lERVZJTkUpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9rZXlTZXJ2ZXJQcmVmaXggKyBcIi93dlwiO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAnJztcbiAgICB9XG5cbiAgICBwcml2YXRlIGRvd25sb2FkTmV3S2V5KHVybDogc3RyaW5nLCBrZXlNZXNzYWdlOiBBcnJheUJ1ZmZlciwgY2FsbGJhY2s6IGFueSkge1xuICAgICAgICAvLyAgICBjb25zb2xlLmxvZygnZG93bmxvYWROZXdLZXkgKHhocik6ICcgKyB1cmwpO1xuXG4gICAgICAgIGxldCBzZWxmID0gdGhpcztcblxuICAgICAgICBsZXQgY2hhbGxlbmdlOiBBcnJheUJ1ZmZlcjtcbiAgICAgICAgbGV0IHhociA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xuICAgICAgICB4aHIub3BlbignUE9TVCcsIHVybCwgdHJ1ZSk7XG4gICAgICAgIHhoci53aXRoQ3JlZGVudGlhbHMgPSBmYWxzZTtcbiAgICAgICAgeGhyLnJlc3BvbnNlVHlwZSA9ICdhcnJheWJ1ZmZlcic7XG4gICAgICAgIHhoci5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBpZiAoeGhyLnJlYWR5U3RhdGUgPT09IDQpIHtcbiAgICAgICAgICAgICAgICBpZiAoeGhyLnN0YXR1cyA9PT0gMjAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKHhoci5yZXNwb25zZSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgc2VsZi5fYWRhcHRpdmVTb3VyY2Uuc2lnbmFsRHJtRXJyb3IoJ0xpY2Vuc2VNYW5hZ2VyIC0gWEhSIGZhaWxlZCAoJyArIHVybCArICcpLiBTdGF0dXM6ICcgKyB4aHIuc3RhdHVzICsgJyAoJyArIHhoci5zdGF0dXNUZXh0ICsgJyknKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIGlmICh0aGlzLl9saWNlbnNlVHlwZSA9PT0gdGhpcy5MSUNFTlNFX1RZUEVfUExBWVJFQURZKSB7XG4gICAgICAgICAgICAvLyBGb3IgUGxheVJlYWR5IENETXMsIHdlIG5lZWQgdG8gZGlnIHRoZSBDaGFsbGVuZ2Ugb3V0IG9mIHRoZSBYTUwuXG4gICAgICAgICAgICB2YXIga2V5TWVzc2FnZVhtbCA9IG5ldyBET01QYXJzZXIoKS5wYXJzZUZyb21TdHJpbmcoU3RyaW5nLmZyb21DaGFyQ29kZS5hcHBseShudWxsLCBuZXcgVWludDE2QXJyYXkoa2V5TWVzc2FnZSkpLCAnYXBwbGljYXRpb24veG1sJyk7XG4gICAgICAgICAgICBpZiAoa2V5TWVzc2FnZVhtbC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnQ2hhbGxlbmdlJylbMF0pIHtcbiAgICAgICAgICAgICAgICBjaGFsbGVuZ2UgPSB1dGlscy5iYXNlNjRUb0J1ZmZlcihrZXlNZXNzYWdlWG1sLmdldEVsZW1lbnRzQnlUYWdOYW1lKCdDaGFsbGVuZ2UnKVswXS5jaGlsZE5vZGVzWzBdLm5vZGVWYWx1ZSkuYnVmZmVyO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBzZWxmLl9hZGFwdGl2ZVNvdXJjZS5zaWduYWxEcm1FcnJvcignQ2Fubm90IGZpbmQgPENoYWxsZW5nZT4gaW4ga2V5IG1lc3NhZ2UnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHZhciBoZWFkZXJOYW1lcyA9IGtleU1lc3NhZ2VYbWwuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ25hbWUnKTtcbiAgICAgICAgICAgIHZhciBoZWFkZXJWYWx1ZXMgPSBrZXlNZXNzYWdlWG1sLmdldEVsZW1lbnRzQnlUYWdOYW1lKCd2YWx1ZScpO1xuICAgICAgICAgICAgaWYgKGhlYWRlck5hbWVzLmxlbmd0aCAhPT0gaGVhZGVyVmFsdWVzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHNlbGYuX2FkYXB0aXZlU291cmNlLnNpZ25hbERybUVycm9yKCdNaXNtYXRjaGVkIGhlYWRlciA8bmFtZT4vPHZhbHVlPiBwYWlyIGluIGtleSBtZXNzYWdlJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGhlYWRlck5hbWVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgeGhyLnNldFJlcXVlc3RIZWFkZXIoaGVhZGVyTmFtZXNbaV0uY2hpbGROb2Rlc1swXS5ub2RlVmFsdWUsIGhlYWRlclZhbHVlc1tpXS5jaGlsZE5vZGVzWzBdLm5vZGVWYWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAodGhpcy5fbGljZW5zZVR5cGUgPT09IHRoaXMuTElDRU5TRV9UWVBFX1dJREVWSU5FKSB7XG4gICAgICAgICAgICAvLyBGb3IgV2lkZXZpbmUgQ0RNcywgdGhlIGNoYWxsZW5nZSBpcyB0aGUga2V5TWVzc2FnZS5cbiAgICAgICAgICAgIGNoYWxsZW5nZSA9IGtleU1lc3NhZ2U7XG4gICAgICAgIH1cblxuICAgICAgICB4aHIuc2VuZChjaGFsbGVuZ2UpO1xuICAgIH1cbn1cbiIsImltcG9ydCB7IE9ic2VydmFibGUgfSBmcm9tICcuL3V0aWxzL29ic2VydmFibGUnO1xuaW1wb3J0IHsgRXZlbnRzIH0gZnJvbSAnLi9ldmVudHMnO1xuaW1wb3J0IHsgUGxheWVyLCBSZXNvbHV0aW9uLCBNaW1lVHlwZSB9IGZyb20gJy4vcGxheWVyJztcbmltcG9ydCAqIGFzIHRodW1iIGZyb20gJy4vdXRpbHMvdGh1bWJuYWlsLWhlbHBlcic7XG5pbXBvcnQgeyBTZWdtZW50TWFwIH0gZnJvbSAnLi91dGlscy9zZWdtZW50LW1hcCc7XG5pbXBvcnQgeyBBZEJyZWFrIH0gZnJvbSAnLi9hZC9hZC1icmVhayc7XG5pbXBvcnQgeyBJRDNIYW5kbGVyLCBJRDNUYWdFdmVudCwgVHh4eElEM0ZyYW1lRXZlbnQsIFByaXZJRDNGcmFtZUV2ZW50LCBUZXh0SUQzRnJhbWVFdmVudCwgU2xpY2VFdmVudCB9IGZyb20gJy4vaWQzL2lkMy1oYW5kbGVyJztcbmltcG9ydCB7IElEM0RhdGEgfSBmcm9tICcuL2lkMy9pZDMtZGF0YSc7XG5pbXBvcnQgeyBBc3NldEluZm8sIEFzc2V0SW5mb1NlcnZpY2UgfSBmcm9tICcuL3dlYi1zZXJ2aWNlcy9hc3NldC1pbmZvLXNlcnZpY2UnO1xuaW1wb3J0IHsgUGluZ1NlcnZpY2UgfSBmcm9tICcuL3dlYi1zZXJ2aWNlcy9waW5nLXNlcnZpY2UnO1xuaW1wb3J0IHsgZ2V0UHJvdG9jb2wgfSBmcm9tICcuL3V0aWxzL3V0aWxzJztcbmltcG9ydCB7IExpY2Vuc2VNYW5hZ2VyRlAgfSBmcm9tICcuL2xpY2Vuc2UtbWFuYWdlci1mcCc7XG5cbmV4cG9ydCBjbGFzcyBOYXRpdmVQbGF5ZXIgZXh0ZW5kcyBPYnNlcnZhYmxlIGltcGxlbWVudHMgUGxheWVyIHtcbiAgICBwcml2YXRlIF92aWRlbzogSFRNTFZpZGVvRWxlbWVudDtcbiAgICBwcml2YXRlIF91cmw6IHN0cmluZztcbiAgICBwcml2YXRlIF9wbGF5bGlzdFR5cGU6IFwiVk9EXCIgfCBcIkVWRU5UXCIgfCBcIkxJVkVcIjtcbiAgICBwcml2YXRlIF9pZDNIYW5kbGVyOiBJRDNIYW5kbGVyO1xuICAgIHByaXZhdGUgX2ZpcmVkUmVhZHlFdmVudDogYm9vbGVhbjtcbiAgICBwcml2YXRlIF9hc3NldEluZm9TZXJ2aWNlOiBBc3NldEluZm9TZXJ2aWNlO1xuICAgIHByaXZhdGUgX3BpbmdTZXJ2aWNlOiBQaW5nU2VydmljZTtcbiAgICBwcml2YXRlIF9zZXNzaW9uSWQ6IHN0cmluZztcbiAgICBwcml2YXRlIF9kb21haW46IHN0cmluZztcbiAgICBwcml2YXRlIF9jdXJyZW50QXNzZXRJZDogc3RyaW5nO1xuICAgIHByaXZhdGUgX2NvbmZpZzogUGxheWVyT3B0aW9ucztcbiAgICBwcml2YXRlIF9pbkFkQnJlYWs6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSBfY3VycmVudEFkQnJlYWs6IEFkQnJlYWs7XG4gICAgcHJpdmF0ZSBfcHJvdG9jb2w6IHN0cmluZztcbiAgICBwcml2YXRlIF9saWNlbnNlTWFuYWdlckZQOiBMaWNlbnNlTWFuYWdlckZQO1xuXG4gICAgLy9kbyBub3RoaW5nIHByb3BlcnRpZXNcbiAgICByZWFkb25seSBudW1iZXJPZlJheXM6IG51bWJlcjtcbiAgICByZWFkb25seSBhdmFpbGFibGVCYW5kd2lkdGhzOiBudW1iZXJbXTtcbiAgICByZWFkb25seSBhdmFpbGFibGVSZXNvbHV0aW9uczogUmVzb2x1dGlvbltdO1xuICAgIHJlYWRvbmx5IGF2YWlsYWJsZU1pbWVUeXBlczogTWltZVR5cGVbXTtcbiAgICByZWFkb25seSBzZWdtZW50TWFwOiBTZWdtZW50TWFwO1xuICAgIHJlYWRvbmx5IGFkQnJlYWtzOiBBZEJyZWFrW107XG4gICAgcmVhZG9ubHkgaXNBdWRpb09ubHk6IGJvb2xlYW47XG5cbiAgICBwcml2YXRlIHJlYWRvbmx5IF9kZWZhdWx0czogUGxheWVyT3B0aW9ucyA9IHtcbiAgICAgICAgZGlzYWJsZVNlZWtEdXJpbmdBZEJyZWFrOiB0cnVlLFxuICAgICAgICBzaG93UG9zdGVyOiBmYWxzZSxcbiAgICAgICAgZGVidWc6IGZhbHNlXG4gICAgfTtcblxuICAgIGNvbnN0cnVjdG9yKHZpZGVvOiBIVE1MVmlkZW9FbGVtZW50LCBvcHRpb25zPzogUGxheWVyT3B0aW9ucykge1xuICAgICAgICBzdXBlcigpO1xuXG4gICAgICAgIC8vaW5pdCBjb25maWdcbiAgICAgICAgdmFyIGRhdGEgPSB7fTtcblxuICAgICAgICAvL3RyeSBwYXJzaW5nIGRhdGEgYXR0cmlidXRlIGNvbmZpZ1xuICAgICAgICB0cnkgeyBkYXRhID0gSlNPTi5wYXJzZSh2aWRlby5nZXRBdHRyaWJ1dGUoJ2RhdGEtY29uZmlnJykpOyB9XG4gICAgICAgIGNhdGNoIChlKSB7IH1cblxuICAgICAgICAvL21lcmdlIGRlZmF1bHRzIHdpdGggdXNlciBvcHRpb25zXG4gICAgICAgIHRoaXMuX2NvbmZpZyA9IE9iamVjdC5hc3NpZ24oe30sIHRoaXMuX2RlZmF1bHRzLCBvcHRpb25zLCBkYXRhKTtcblxuICAgICAgICB0aGlzLl92aWRlbyA9IHZpZGVvO1xuICAgICAgICB0aGlzLl9pZDNIYW5kbGVyID0gbmV3IElEM0hhbmRsZXIodmlkZW8pO1xuICAgICAgICB0aGlzLl9pZDNIYW5kbGVyLm9uKElEM0hhbmRsZXIuRXZlbnQuSUQzVGFnLCB0aGlzLl9vbklEM1RhZy5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5faWQzSGFuZGxlci5vbihJRDNIYW5kbGVyLkV2ZW50LlR4eHhJRDNGcmFtZSwgdGhpcy5fb25UeHh4SUQzRnJhbWUuYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuX2lkM0hhbmRsZXIub24oSUQzSGFuZGxlci5FdmVudC5Qcml2SUQzRnJhbWUsIHRoaXMuX29uUHJpdklEM0ZyYW1lLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLl9pZDNIYW5kbGVyLm9uKElEM0hhbmRsZXIuRXZlbnQuVGV4dElEM0ZyYW1lLCB0aGlzLl9vblRleHRJRDNGcmFtZS5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5faWQzSGFuZGxlci5vbihJRDNIYW5kbGVyLkV2ZW50LlNsaWNlRW50ZXJlZCwgdGhpcy5fb25TbGljZUVudGVyZWQuYmluZCh0aGlzKSk7XG5cbiAgICAgICAgdGhpcy5fb25EdXJhdGlvbkNoYW5nZSA9IHRoaXMuX29uRHVyYXRpb25DaGFuZ2UuYmluZCh0aGlzKTtcblxuICAgICAgICB0aGlzLl9vdmVycmlkZUN1cnJlbnRUaW1lKCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBwcmVwYXJlTG9hZCh1cmw6IHN0cmluZyk6IHZvaWQge1xuICAgICAgICB0aGlzLl9wcm90b2NvbCA9IGdldFByb3RvY29sKHVybCk7XG5cbiAgICAgICAgdGhpcy5fZmlyZWRSZWFkeUV2ZW50ID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2N1cnJlbnRBc3NldElkID0gbnVsbDtcblxuICAgICAgICB0aGlzLl92aWRlby5yZW1vdmVFdmVudExpc3RlbmVyKCdkdXJhdGlvbmNoYW5nZScsIHRoaXMuX29uRHVyYXRpb25DaGFuZ2UpO1xuICAgICAgICB0aGlzLl92aWRlby5hZGRFdmVudExpc3RlbmVyKCdkdXJhdGlvbmNoYW5nZScsIHRoaXMuX29uRHVyYXRpb25DaGFuZ2UpO1xuICAgICAgICB0aGlzLl92aWRlby5hdWRpb1RyYWNrcy5hZGRFdmVudExpc3RlbmVyKCdhZGR0cmFjaycsIHRoaXMuX29uQXVkaW9UcmFja0FkZGVkLmJpbmQodGhpcykpO1xuXG4gICAgICAgIC8vc2Vzc2lvbklkICg/cGJzPSkgbWF5IG9yIG1heSBub3QgYmUgcGFydCBvZiB0aGUgdXJsXG4gICAgICAgIHRoaXMuX3Nlc3Npb25JZCA9IHRoaXMuX2dldFNlc3Npb25JZCh1cmwpO1xuICAgICAgICB0aGlzLl9kb21haW4gPSB0aGlzLl9nZXREb21haW4odXJsKTtcblxuICAgICAgICB0aGlzLl9saWNlbnNlTWFuYWdlckZQID0gbmV3IExpY2Vuc2VNYW5hZ2VyRlAodGhpcy5fdmlkZW8pO1xuXG4gICAgICAgIGlmICh0aGlzLl9pc1VwbHlua1VybCh1cmwpKSB7XG4gICAgICAgICAgICB0aGlzLl9hc3NldEluZm9TZXJ2aWNlID0gbmV3IEFzc2V0SW5mb1NlcnZpY2UodGhpcy5fcHJvdG9jb2wsIHRoaXMuZG9tYWluKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vY2FuJ3QgdXNlICdjb250ZW50LnVwbHluay5jb20nIGFzIGEgZG9tYWluIG5hbWUgYmVjYXVzZSBzZXNzaW9uIGRhdGEgbGl2ZXNcbiAgICAgICAgLy8gaW5zaWRlIGEgc3BlY2lmaWMgZG9tYWluXG4gICAgICAgIGlmICh0aGlzLl9kb21haW4gIT09ICdjb250ZW50LnVwbHluay5jb20nKSB7XG4gICAgICAgICAgICB0aGlzLl9waW5nU2VydmljZSA9IG5ldyBQaW5nU2VydmljZSh0aGlzLl9wcm90b2NvbCwgdGhpcy5kb21haW4sIHRoaXMuX3Nlc3Npb25JZCwgdGhpcy5fdmlkZW8pO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fdXJsID0gdXJsO1xuICAgICAgICB0aGlzLl92aWRlby5zcmMgPSB1cmw7XG4gICAgfVxuXG4gICAgcHVibGljIGxvYWQoaW5mbzogc3RyaW5nIHwgTG9hZENvbmZpZyk6IHZvaWQge1xuICAgICAgICBsZXQgdXJsOiBzdHJpbmcgPSBudWxsO1xuICAgICAgICBsZXQgZmFpcnBsYXlDZXJ0UGF0aDogc3RyaW5nID0gbnVsbDtcblxuICAgICAgICBpZiAodHlwZW9mIGluZm8gPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIHVybCA9IGluZm8gYXMgc3RyaW5nO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdXJsID0gKGluZm8gYXMgTG9hZENvbmZpZykudXJsO1xuICAgICAgICAgICAgaWYgKChpbmZvIGFzIExvYWRDb25maWcpLmZhaXJwbGF5Q2VydGlmaWNhdGVQYXRoICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICBmYWlycGxheUNlcnRQYXRoID0gKGluZm8gYXMgTG9hZENvbmZpZykuZmFpcnBsYXlDZXJ0aWZpY2F0ZVBhdGg7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnByZXBhcmVMb2FkKHVybCk7XG5cbiAgICAgICAgaWYgKGZhaXJwbGF5Q2VydFBhdGgpIHtcbiAgICAgICAgICAgIC8vIExvYWQgRmFpcnBsYXlcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiTG9hZGluZyB3aXRoIEZhaXJwbGF5XCIpO1xuICAgICAgICAgICAgdGhpcy5fbGljZW5zZU1hbmFnZXJGUC5sb2FkKGZhaXJwbGF5Q2VydFBhdGgpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5fdmlkZW8ubG9hZCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIGRlc3Ryb3koKTogdm9pZCB7XG4gICAgICAgIHRoaXMuX3ZpZGVvLnNyYyA9IG51bGw7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb3ZlcnJpZGVDdXJyZW50VGltZSgpOiB2b2lkIHtcbiAgICAgICAgLy9vdmVycmlkZSAnY3VycmVudFRpbWUnIHByb3BlcnR5IHNvIHdlIGNhbiBwcmV2ZW50XG4gICAgICAgIC8vIHVzZXJzIGZyb20gc2V0dGluZyB2aWRlby5jdXJyZW50VGltZSwgYWxsb3dpbmcgdGhlbVxuICAgICAgICAvLyB0byBza2lwIGFkcy5cbiAgICAgICAgY29uc3QgY3VycmVudFRpbWVEZXNjcmlwdG9yID0gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcihIVE1MTWVkaWFFbGVtZW50LnByb3RvdHlwZSwgJ2N1cnJlbnRUaW1lJyk7XG4gICAgICAgIGlmIChjdXJyZW50VGltZURlc2NyaXB0b3IpIHtcbiAgICAgICAgICAgIGNvbnN0IGdldEN1cnJlbnRUaW1lID0gY3VycmVudFRpbWVEZXNjcmlwdG9yLmdldDtcbiAgICAgICAgICAgIGNvbnN0IHNldEN1cnJlbnRUaW1lID0gY3VycmVudFRpbWVEZXNjcmlwdG9yLnNldDtcblxuICAgICAgICAgICAgbGV0IHNlbGYgPSB0aGlzO1xuXG4gICAgICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkodGhpcy5fdmlkZW8sICdjdXJyZW50VGltZScsIHtcbiAgICAgICAgICAgICAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGdldEN1cnJlbnRUaW1lLmFwcGx5KHRoaXMpO1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgc2V0OiBmdW5jdGlvbiAodmFsKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChzZWxmLmNhblNlZWsoKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2V0Q3VycmVudFRpbWUuYXBwbHkodGhpcywgW3ZhbF0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBlbnVtZXJhYmxlOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBjb25maWd1cmFibGU6IGZhbHNlLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEZXRlcm1pbmVzIGlmIHRoZSBwbGF5ZXIgY2FuIHNlZWsgZ2l2ZW4gaXQncyBjdXJyZW50IHBvc2l0aW9uIGFuZFxuICAgICAqIHdldGhlciBvciBub3QgaXQncyBpbiBhbiBhZCBicmVhay5cbiAgICAgKiBAcmV0dXJuIHtib29sZWFufSBUcnVlIGlmIHRoZSBwbGF5ZXIgY2FuIHNlZWssIG90aGVyd2lzZSBmYWxzZS5cbiAgICAgKi9cbiAgICBjYW5TZWVrKCk6IGJvb2xlYW4ge1xuICAgICAgICBpZiAoIXRoaXMuX2NvbmZpZy5kaXNhYmxlU2Vla0R1cmluZ0FkQnJlYWspIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuICF0aGlzLl9pbkFkQnJlYWs7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfZ2V0U2Vzc2lvbklkKHVybDogc3RyaW5nKTogc3RyaW5nIHtcbiAgICAgICAgLy9odHRwOi8vc3RhY2tvdmVyZmxvdy5jb20vYS81MTU4MzAxXG4gICAgICAgIHZhciBtYXRjaCA9IFJlZ0V4cCgnWz8mXXBicz0oW14mXSopJykuZXhlYyh1cmwpO1xuICAgICAgICByZXR1cm4gbWF0Y2ggJiYgZGVjb2RlVVJJQ29tcG9uZW50KG1hdGNoWzFdLnJlcGxhY2UoL1xcKy9nLCAnICcpKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9nZXREb21haW4odXJsOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgICAgICB2YXIgbGluayA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcbiAgICAgICAgbGluay5zZXRBdHRyaWJ1dGUoJ2hyZWYnLCB1cmwpO1xuXG4gICAgICAgIHJldHVybiBsaW5rLmhvc3RuYW1lO1xuICAgIH1cblxuICAgIHByaXZhdGUgX2lzVXBseW5rVXJsKHVybDogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgICAgIGNvbnN0IHRlbXAgPSB1cmwudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgcmV0dXJuIHRlbXAuaW5kZXhPZigndXBseW5rLmNvbScpID4gLTEgfHwgdGVtcC5pbmRleE9mKCdkb3dubHluay5jb20nKSA+IC0xO1xuICAgIH1cblxuICAgIHByaXZhdGUgX29uRHVyYXRpb25DaGFuZ2UoKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLl92aWRlby5kdXJhdGlvbiA9PT0gSW5maW5pdHkpIHtcbiAgICAgICAgICAgIHRoaXMuX3BsYXlsaXN0VHlwZSA9ICdMSVZFJztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuX3BsYXlsaXN0VHlwZSA9ICdWT0QnO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCF0aGlzLl9maXJlZFJlYWR5RXZlbnQpIHtcbiAgICAgICAgICAgIHRoaXMuX2ZpcmVkUmVhZHlFdmVudCA9IHRydWU7XG4gICAgICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5SZWFkeSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBzdGF0aWMgZ2V0IEV2ZW50KCkge1xuICAgICAgICByZXR1cm4gRXZlbnRzO1xuICAgIH1cblxuICAgIHB1YmxpYyBzZXRCcm93c2VyKHNhZmFyaTogYm9vbGVhbiwgaWU6IGJvb2xlYW4sIGNocm9tZTogYm9vbGVhbiwgZmlyZWZveDogYm9vbGVhbikge1xuICAgICAgICAvL2RvIG5vdGhpbmdcbiAgICB9XG5cbiAgICBwdWJsaWMgZ2V0VGh1bWJuYWlsKHRpbWU6IG51bWJlciwgc2l6ZTogXCJzbWFsbFwiIHwgXCJsYXJnZVwiKTogdGh1bWIuVGh1bWJuYWlsIHtcbiAgICAgICAgLy9kbyBub3RoaW5nXG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGdldCBhdWRpb1RyYWNrcygpOiBBdWRpb1RyYWNrTGlzdCB7XG4gICAgICAgIHJldHVybiB0aGlzLl92aWRlby5hdWRpb1RyYWNrcztcbiAgICB9XG5cbiAgICBnZXQgYXVkaW9UcmFja0lkKCk6IG51bWJlciB7XG4gICAgICAgIGxldCBjdXJyZW50VHJhY2sgPSB0aGlzLmF1ZGlvVHJhY2s7XG4gICAgICAgIGlmIChjdXJyZW50VHJhY2sgIT0gbnVsbCkge1xuICAgICAgICAgICAgcmV0dXJuIHBhcnNlSW50KGN1cnJlbnRUcmFjay5pZCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIDA7XG5cbiAgICB9XG5cbiAgICBzZXQgYXVkaW9UcmFja0lkKGlkOiBudW1iZXIpIHtcbiAgICAgICAgbGV0IGF1ZGlvVHJhY2tzID0gdGhpcy5hdWRpb1RyYWNrcztcblxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGF1ZGlvVHJhY2tzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBpZiAocGFyc2VJbnQoYXVkaW9UcmFja3NbaV0uaWQpID09PSBpZCkge1xuICAgICAgICAgICAgICAgIGF1ZGlvVHJhY2tzW2ldLmVuYWJsZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldCBhdWRpb1RyYWNrKCk6IEF1ZGlvVHJhY2sge1xuICAgICAgICBsZXQgYXVkaW9UcmFja3MgPSB0aGlzLmF1ZGlvVHJhY2tzO1xuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYXVkaW9UcmFja3MubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGlmIChhdWRpb1RyYWNrc1tpXS5lbmFibGVkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGF1ZGlvVHJhY2tzW2ldO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgZ2V0IGRvbWFpbigpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdGhpcy5fZG9tYWluO1xuICAgIH1cblxuICAgIGdldCBzZXNzaW9uSWQoKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3Nlc3Npb25JZDtcbiAgICB9XG5cbiAgICBnZXQgcGxheWxpc3RUeXBlKCk6IFwiVk9EXCIgfCBcIkVWRU5UXCIgfCBcIkxJVkVcIiB7XG4gICAgICAgIHJldHVybiB0aGlzLl9wbGF5bGlzdFR5cGU7XG4gICAgfVxuXG4gICAgZ2V0IGR1cmF0aW9uKCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLl92aWRlby5kdXJhdGlvbjtcbiAgICB9XG5cbiAgICBnZXQgc3VwcG9ydHNUaHVtYm5haWxzKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgZ2V0IGNsYXNzTmFtZSgpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gJ05hdGl2ZVBsYXllcic7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25JRDNUYWcoZXZlbnQ6IElEM1RhZ0V2ZW50KTogdm9pZCB7XG4gICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLklEM1RhZywgZXZlbnQpO1xuICAgIH1cblxuICAgIHByaXZhdGUgX29uVHh4eElEM0ZyYW1lKGV2ZW50OiBUeHh4SUQzRnJhbWVFdmVudCk6IHZvaWQge1xuICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5UeHh4SUQzRnJhbWUsIGV2ZW50KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vblByaXZJRDNGcmFtZShldmVudDogUHJpdklEM0ZyYW1lRXZlbnQpOiB2b2lkIHtcbiAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuUHJpdklEM0ZyYW1lLCBldmVudCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25UZXh0SUQzRnJhbWUoZXZlbnQ6IFRleHRJRDNGcmFtZUV2ZW50KTogdm9pZCB7XG4gICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLlRleHRJRDNGcmFtZSwgZXZlbnQpO1xuICAgIH1cblxuICAgIHByaXZhdGUgX29uQXVkaW9UcmFja0FkZGVkKGV2ZW50OiBUcmFja0V2ZW50KTogdm9pZCB7XG4gICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLkF1ZGlvVHJhY2tBZGRlZCwgZXZlbnQpO1xuICAgIH1cblxuICAgIHByaXZhdGUgX29uU2xpY2VFbnRlcmVkKGV2ZW50OiBTbGljZUV2ZW50KTogdm9pZCB7XG4gICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLlNsaWNlRW50ZXJlZCwgZXZlbnQpO1xuXG4gICAgICAgIGlmICghdGhpcy5fYXNzZXRJbmZvU2VydmljZSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuX2N1cnJlbnRBc3NldElkID09PSBudWxsKSB7XG4gICAgICAgICAgICAvL2ZpcnN0IGFzc2V0IGlkIGVuY291bnRlcmVkXG4gICAgICAgICAgICB0aGlzLl9hc3NldEluZm9TZXJ2aWNlLmxvYWRBc3NldElkKGV2ZW50LmFzc2V0SWQsIG51bGwsIChhc3NldEluZm86IEFzc2V0SW5mbykgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuX2N1cnJlbnRBc3NldElkID0gZXZlbnQuYXNzZXRJZDtcbiAgICAgICAgICAgICAgICB0aGlzLl9vbkFzc2V0RW5jb3VudGVyZWQoZXZlbnQuY3VlLCBhc3NldEluZm8pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5fY3VycmVudEFzc2V0SWQgIT09IGV2ZW50LmFzc2V0SWQpIHtcbiAgICAgICAgICAgIHRoaXMuX2Fzc2V0SW5mb1NlcnZpY2UubG9hZEFzc2V0SWQodGhpcy5fY3VycmVudEFzc2V0SWQsIG51bGwsIChjdXJyZW50QXNzZXRJbmZvOiBBc3NldEluZm8pID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLl9hc3NldEluZm9TZXJ2aWNlLmxvYWRBc3NldElkKGV2ZW50LmFzc2V0SWQsIG51bGwsIChuZXdBc3NldEluZm86IEFzc2V0SW5mbykgPT4ge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9jdXJyZW50QXNzZXRJZCA9IGV2ZW50LmFzc2V0SWQ7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX29uTmV3QXNzZXRFbmNvdW50ZXJlZChldmVudC5jdWUsIGN1cnJlbnRBc3NldEluZm8sIG5ld0Fzc2V0SW5mbyk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vc2FtZSBhc3NldCBpZCBhcyBwcmV2aW91cyBvbmUsIGRvIG5vdGhpbmdcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgX29uQXNzZXRFbmNvdW50ZXJlZChjdWU6IFRleHRUcmFja0N1ZSwgYXNzZXRJbmZvOiBBc3NldEluZm8pOiB2b2lkIHtcbiAgICAgICAgbGV0IHNlZ21lbnQ6IFNlZ21lbnQgPSB1bmRlZmluZWQ7XG5cbiAgICAgICAgaWYgKGFzc2V0SW5mby5pc0FkKSB7XG4gICAgICAgICAgICBzZWdtZW50ID0ge1xuICAgICAgICAgICAgICAgIGlkOiBhc3NldEluZm8uYXNzZXQsXG4gICAgICAgICAgICAgICAgaW5kZXg6IDAsXG4gICAgICAgICAgICAgICAgc3RhcnRUaW1lOiBjdWUuc3RhcnRUaW1lLFxuICAgICAgICAgICAgICAgIGVuZFRpbWU6IGN1ZS5zdGFydFRpbWUgKyBhc3NldEluZm8uZHVyYXRpb24sXG4gICAgICAgICAgICAgICAgdHlwZTogJ0FEJ1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgbGV0IHNlZ21lbnRzOiBTZWdtZW50W10gPSBbc2VnbWVudF07XG4gICAgICAgICAgICB0aGlzLl9jdXJyZW50QWRCcmVhayA9IG5ldyBBZEJyZWFrKHNlZ21lbnRzKTtcbiAgICAgICAgICAgIHRoaXMuX2luQWRCcmVhayA9IHRydWU7XG5cbiAgICAgICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLkFzc2V0RW50ZXJlZCwgeyBzZWdtZW50OiBzZWdtZW50LCBhc3NldDogYXNzZXRJbmZvIH0pO1xuICAgICAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuQWRCcmVha0VudGVyZWQsIHsgYWRCcmVhazogdGhpcy5fY3VycmVudEFkQnJlYWsgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLl9pbkFkQnJlYWsgPSBmYWxzZTtcblxuICAgICAgICAgICAgLy9kb24ndCBoYXZlIGEgc2VnbWVudCB0byBwYXNzIGFsb25nIGJlY2F1c2Ugd2UgZG9uJ3Qga25vdyB0aGUgZHVyYXRpb24gb2YgdGhpcyBhc3NldFxuICAgICAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuQXNzZXRFbnRlcmVkLCB7IHNlZ21lbnQ6IHVuZGVmaW5lZCwgYXNzZXQ6IGFzc2V0SW5mbyB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgX29uTmV3QXNzZXRFbmNvdW50ZXJlZChjdWU6IFRleHRUcmFja0N1ZSwgcHJldmlvdXNBc3NldDogQXNzZXRJbmZvLCBuZXdBc3NldDogQXNzZXRJbmZvKTogdm9pZCB7XG4gICAgICAgIC8vd2lsbCB3ZSBzdGlsbCBiZSBpbiBhbiBhZCBicmVhayBhZnRlciB0aGlzIGFzc2V0P1xuICAgICAgICB0aGlzLl9pbkFkQnJlYWsgPSBuZXdBc3NldC5pc0FkO1xuXG4gICAgICAgIGlmIChwcmV2aW91c0Fzc2V0LmlzQWQgJiYgdGhpcy5fY3VycmVudEFkQnJlYWspIHtcbiAgICAgICAgICAgIC8vbGVhdmluZyBhZCBicmVha1xuICAgICAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuQXNzZXRFeGl0ZWQsIHsgc2VnbWVudDogdGhpcy5fY3VycmVudEFkQnJlYWsuZ2V0U2VnbWVudEF0KDApLCBhc3NldDogcHJldmlvdXNBc3NldCB9KTtcbiAgICAgICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLkFkQnJlYWtFeGl0ZWQsIHsgYWRCcmVhazogdGhpcy5fY3VycmVudEFkQnJlYWsgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvL2Rvbid0IGhhdmUgYSBzZWdtZW50IHRvIHBhc3MgYWxvbmcgYmVjYXVzZSB3ZSBkb24ndCBrbm93IHRoZSBkdXJhdGlvbiBvZiB0aGlzIGFzc2V0XG4gICAgICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5Bc3NldEV4aXRlZCwgeyBzZWdtZW50OiB1bmRlZmluZWQsIGFzc2V0OiBwcmV2aW91c0Fzc2V0IH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fb25Bc3NldEVuY291bnRlcmVkKGN1ZSwgbmV3QXNzZXQpO1xuICAgIH1cblxuICAgIHB1YmxpYyBvblRleHRUcmFja0NoYW5nZWQoY2hhbmdlVHJhY2tFdmVudDogVHJhY2tFdmVudCk6IHZvaWQge1xuICAgICAgICAvL2RvIG5vdGhpbmdcbiAgICB9XG5cbiAgICBnZXQgdmVyc2lvbigpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gJzAyLjAwLjE4MDMyNzAwJzsgLy93aWxsIGJlIG1vZGlmaWVkIGJ5IHRoZSBidWlsZCBzY3JpcHRcbiAgICB9XG59XG4iLCJcbi8vcG9seWZpbGwgQXJyYXkuZmluZCgpXG4vL2h0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0phdmFTY3JpcHQvUmVmZXJlbmNlL0dsb2JhbF9PYmplY3RzL0FycmF5L2ZpbmRcbi8vIGh0dHBzOi8vdGMzOS5naXRodWIuaW8vZWNtYTI2Mi8jc2VjLWFycmF5LnByb3RvdHlwZS5maW5kXG5pZiAoIUFycmF5LnByb3RvdHlwZS5maW5kKSB7XG4gIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShBcnJheS5wcm90b3R5cGUsICdmaW5kJywge1xuICAgIHZhbHVlOiBmdW5jdGlvbihwcmVkaWNhdGU6YW55KSB7XG4gICAgIC8vIDEuIExldCBPIGJlID8gVG9PYmplY3QodGhpcyB2YWx1ZSkuXG4gICAgICBpZiAodGhpcyA9PSBudWxsKSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ1widGhpc1wiIGlzIG51bGwgb3Igbm90IGRlZmluZWQnKTtcbiAgICAgIH1cblxuICAgICAgdmFyIG8gPSBPYmplY3QodGhpcyk7XG5cbiAgICAgIC8vIDIuIExldCBsZW4gYmUgPyBUb0xlbmd0aCg/IEdldChPLCBcImxlbmd0aFwiKSkuXG4gICAgICB2YXIgbGVuID0gby5sZW5ndGggPj4+IDA7XG5cbiAgICAgIC8vIDMuIElmIElzQ2FsbGFibGUocHJlZGljYXRlKSBpcyBmYWxzZSwgdGhyb3cgYSBUeXBlRXJyb3IgZXhjZXB0aW9uLlxuICAgICAgaWYgKHR5cGVvZiBwcmVkaWNhdGUgIT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcigncHJlZGljYXRlIG11c3QgYmUgYSBmdW5jdGlvbicpO1xuICAgICAgfVxuXG4gICAgICAvLyA0LiBJZiB0aGlzQXJnIHdhcyBzdXBwbGllZCwgbGV0IFQgYmUgdGhpc0FyZzsgZWxzZSBsZXQgVCBiZSB1bmRlZmluZWQuXG4gICAgICB2YXIgdGhpc0FyZyA9IGFyZ3VtZW50c1sxXTtcblxuICAgICAgLy8gNS4gTGV0IGsgYmUgMC5cbiAgICAgIHZhciBrID0gMDtcblxuICAgICAgLy8gNi4gUmVwZWF0LCB3aGlsZSBrIDwgbGVuXG4gICAgICB3aGlsZSAoayA8IGxlbikge1xuICAgICAgICAvLyBhLiBMZXQgUGsgYmUgISBUb1N0cmluZyhrKS5cbiAgICAgICAgLy8gYi4gTGV0IGtWYWx1ZSBiZSA/IEdldChPLCBQaykuXG4gICAgICAgIC8vIGMuIExldCB0ZXN0UmVzdWx0IGJlIFRvQm9vbGVhbig/IENhbGwocHJlZGljYXRlLCBULCDCqyBrVmFsdWUsIGssIE8gwrspKS5cbiAgICAgICAgLy8gZC4gSWYgdGVzdFJlc3VsdCBpcyB0cnVlLCByZXR1cm4ga1ZhbHVlLlxuICAgICAgICB2YXIga1ZhbHVlID0gb1trXTtcbiAgICAgICAgaWYgKHByZWRpY2F0ZS5jYWxsKHRoaXNBcmcsIGtWYWx1ZSwgaywgbykpIHtcbiAgICAgICAgICByZXR1cm4ga1ZhbHVlO1xuICAgICAgICB9XG4gICAgICAgIC8vIGUuIEluY3JlYXNlIGsgYnkgMS5cbiAgICAgICAgaysrO1xuICAgICAgfVxuXG4gICAgICAvLyA3LiBSZXR1cm4gdW5kZWZpbmVkLlxuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gIH0pO1xufSIsIlxuLy9wb2x5ZmlsbCBmb3IgT2JqZWN0LmFzc2lnbigpIGZvciBJRTExXG4vL2h0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0phdmFTY3JpcHQvUmVmZXJlbmNlL0dsb2JhbF9PYmplY3RzL09iamVjdC9hc3NpZ25cbmlmICh0eXBlb2YgT2JqZWN0LmFzc2lnbiAhPSAnZnVuY3Rpb24nKSB7XG4gIChmdW5jdGlvbiAoKSB7XG4gICAgT2JqZWN0LmFzc2lnbiA9IGZ1bmN0aW9uICh0YXJnZXQ6IGFueSkge1xuICAgICAgJ3VzZSBzdHJpY3QnO1xuICAgICAgLy8gV2UgbXVzdCBjaGVjayBhZ2FpbnN0IHRoZXNlIHNwZWNpZmljIGNhc2VzLlxuICAgICAgaWYgKHRhcmdldCA9PT0gdW5kZWZpbmVkIHx8IHRhcmdldCA9PT0gbnVsbCkge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdDYW5ub3QgY29udmVydCB1bmRlZmluZWQgb3IgbnVsbCB0byBvYmplY3QnKTtcbiAgICAgIH1cblxuICAgICAgdmFyIG91dHB1dCA9IE9iamVjdCh0YXJnZXQpO1xuICAgICAgZm9yICh2YXIgaW5kZXggPSAxOyBpbmRleCA8IGFyZ3VtZW50cy5sZW5ndGg7IGluZGV4KyspIHtcbiAgICAgICAgdmFyIHNvdXJjZSA9IGFyZ3VtZW50c1tpbmRleF07XG4gICAgICAgIGlmIChzb3VyY2UgIT09IHVuZGVmaW5lZCAmJiBzb3VyY2UgIT09IG51bGwpIHtcbiAgICAgICAgICBmb3IgKHZhciBuZXh0S2V5IGluIHNvdXJjZSkge1xuICAgICAgICAgICAgaWYgKHNvdXJjZS5oYXNPd25Qcm9wZXJ0eShuZXh0S2V5KSkge1xuICAgICAgICAgICAgICBvdXRwdXRbbmV4dEtleV0gPSBzb3VyY2VbbmV4dEtleV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gb3V0cHV0O1xuICAgIH07XG4gIH0pKCk7XG59IiwiXG4vL3BvbHlmaWxsIGZvciBWVFRDdWUgZm9yIE1TIEVkZ2UgYW5kIElFMTFcbihmdW5jdGlvbiAoKSB7XG4gICAgKDxhbnk+d2luZG93KS5WVFRDdWUgPSAoPGFueT53aW5kb3cpLlZUVEN1ZSB8fCAoPGFueT53aW5kb3cpLlRleHRUcmFja0N1ZTtcbn0pKCk7XG4iLCJpbXBvcnQgJy4vcG9seWZpbGwvdnR0LWN1ZSc7XG5pbXBvcnQgJy4vcG9seWZpbGwvb2JqZWN0JztcbmltcG9ydCAnLi9wb2x5ZmlsbC9hcnJheSc7XG5pbXBvcnQgeyBQbGF5ZXIgfSBmcm9tICcuL3BsYXllcic7XG5pbXBvcnQgeyBBZGFwdGl2ZVBsYXllciB9IGZyb20gJy4vYWRhcHRpdmUtcGxheWVyJztcbmltcG9ydCB7IE5hdGl2ZVBsYXllciB9IGZyb20gJy4vbmF0aXZlLXBsYXllcic7XG5cblxuZnVuY3Rpb24gaXNOYXRpdmVQbGF5YmFja1N1cHBvcnRlZCgpOiBib29sZWFuIHtcbiAgICB0cnkge1xuICAgICAgICBsZXQgdmlkZW8gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCd2aWRlbycpO1xuXG4gICAgICAgIGlmICh2aWRlby5jYW5QbGF5VHlwZSkge1xuICAgICAgICAgICAgcmV0dXJuIHZpZGVvLmNhblBsYXlUeXBlKCdhcHBsaWNhdGlvbi92bmQuYXBwbGUubXBlZ3VybCcpICE9PSAnJztcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIHJldHVybiBmYWxzZTtcbn1cblxuZnVuY3Rpb24gaXNIdG1sUGxheWJhY2tTdXBwb3J0ZWQoKTogYm9vbGVhbiB7XG4gICAgaWYgKCdNZWRpYVNvdXJjZScgaW4gd2luZG93ICYmIE1lZGlhU291cmNlLmlzVHlwZVN1cHBvcnRlZCkge1xuICAgICAgICByZXR1cm4gTWVkaWFTb3VyY2UuaXNUeXBlU3VwcG9ydGVkKCd2aWRlby9tcDQ7IGNvZGVjcz1cImF2YzEuNDJFMDFFLG1wNGEuNDAuMlwiJyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGZhbHNlO1xufVxuXG5mdW5jdGlvbiBjdXJyZW50U2NyaXB0KCkge1xuICAgIC8vaGFja3ksIGJ1dCB3b3JrcyBmb3Igb3VyIG5lZWRzXG4gICAgY29uc3Qgc2NyaXB0cyA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCdzY3JpcHQnKTtcbiAgICBpZiAoc2NyaXB0cyAmJiBzY3JpcHRzLmxlbmd0aCkge1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHNjcmlwdHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGlmIChzY3JpcHRzW2ldLnNyYy5pbmRleE9mKCd1cGx5bmstY29yZS5qcycpID4gLTEgfHwgc2NyaXB0c1tpXS5zcmMuaW5kZXhPZigndXBseW5rLWNvcmUubWluLmpzJykgPiAtMSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBzY3JpcHRzW2ldO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cblxudmFyIGxvYWRlZFVwbHlua0FkYXB0aXZlID0gdHJ1ZTtcblxuZnVuY3Rpb24gbG9hZFVwbHlua0FkYXB0aXZlUGxheWVyKHZpZGVvOiBIVE1MVmlkZW9FbGVtZW50LCBvcHRpb25zPzogUGxheWVyT3B0aW9ucywgY2FsbGJhY2s/OiAocGxheWVyOiBQbGF5ZXIpID0+IHZvaWQpIHtcblxuICAgIC8vbG9hZCB1cGx5bmstYWRhcHRpdmUuanNcbiAgICBsZXQgdXJsID0gY3VycmVudFNjcmlwdCgpLnNyYy5zdWJzdHJpbmcoMCwgY3VycmVudFNjcmlwdCgpLnNyYy5sYXN0SW5kZXhPZignLycpICsgMSkgKyAndXBseW5rLWFkYXB0aXZlLmpzJztcblxuICAgIC8vIGlmIHVzaW5nIFdlYkFzc2VtYmx5LCB0aGUgd2FzbSBpcyBhbHJlYWR5IGxvYWRlZCBmcm9tIHRoZSBodG1sXG4gICAgbGV0IGVuYWJsZVdBU00gPSBmYWxzZTtcbiAgICBpZiAoZW5hYmxlV0FTTSAmJiB0eXBlb2YgV2ViQXNzZW1ibHkgPT09ICdvYmplY3QnKSB7XG4gICAgICAgIGNhbGxiYWNrKG5ldyBBZGFwdGl2ZVBsYXllcih2aWRlbywgb3B0aW9ucykpO1xuICAgIH1cbiAgICBlbHNlIGlmICghaXNTY3JpcHRBbHJlYWR5SW5jbHVkZWQodXJsKSkge1xuICAgICAgICBsb2FkZWRVcGx5bmtBZGFwdGl2ZSA9IGZhbHNlO1xuICAgICAgICBsb2FkU2NyaXB0QXN5bmModXJsLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBsb2FkZWRVcGx5bmtBZGFwdGl2ZSA9IHRydWU7XG4gICAgICAgICAgICBjYWxsYmFjayhuZXcgQWRhcHRpdmVQbGF5ZXIodmlkZW8sIG9wdGlvbnMpKTtcbiAgICAgICAgfSk7XG4gICAgfSBlbHNlIGlmIChsb2FkZWRVcGx5bmtBZGFwdGl2ZSkge1xuICAgICAgICBjYWxsYmFjayhuZXcgQWRhcHRpdmVQbGF5ZXIodmlkZW8sIG9wdGlvbnMpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICAvL3NjcmlwdCBpcyBsb2FkaW5nIHNvIHdlJ2xsIGtlZXAgY2hlY2tpbmcgaXQnc1xuICAgICAgICAvLyBzdGF0dXMgYmVmb3JlIGZpcmluZyB0aGUgY2FsbGJhY2tcbiAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBsb2FkVXBseW5rQWRhcHRpdmVQbGF5ZXIodmlkZW8sIG9wdGlvbnMsIGNhbGxiYWNrKTtcbiAgICAgICAgfSwgNTAwKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGxvYWRTY3JpcHRBc3luYyh1cmw6IHN0cmluZywgY2FsbGJhY2s6ICgpID0+IHZvaWQpOiB2b2lkIHtcbiAgICBsZXQgaGVhZCA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCdoZWFkJylbMF07XG4gICAgbGV0IHNjcmlwdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NjcmlwdCcpO1xuXG4gICAgc2NyaXB0LnR5cGUgPSAndGV4dC9qYXZhc2NyaXB0JztcbiAgICBzY3JpcHQuc3JjID0gdXJsO1xuXG4gICAgc2NyaXB0Lm9ubG9hZCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgY2FsbGJhY2soKTtcbiAgICB9O1xuXG4gICAgaGVhZC5hcHBlbmRDaGlsZChzY3JpcHQpO1xufVxuXG5mdW5jdGlvbiBpc1NjcmlwdEFscmVhZHlJbmNsdWRlZCh1cmw6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgIHZhciBzY3JpcHRzID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoXCJzY3JpcHRcIik7XG4gICAgaWYgKHNjcmlwdHMgJiYgc2NyaXB0cy5sZW5ndGgpIHtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzY3JpcHRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBpZiAoc2NyaXB0c1tpXS5zcmMgPT09IHVybCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGZhbHNlO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVBZGFwdGl2ZVBsYXllcih2aWRlbzogSFRNTFZpZGVvRWxlbWVudCwgb3B0aW9uczogYW55LCBjYWxsYmFjaz86IChwbGF5ZXI6IFBsYXllcikgPT4gdm9pZCkge1xuXG4gICAgaWYgKG9wdGlvbnMucHJlZmVyTmF0aXZlUGxheWJhY2spIHtcbiAgICAgICAgaWYgKGlzTmF0aXZlUGxheWJhY2tTdXBwb3J0ZWQoKSkge1xuICAgICAgICAgICAgLy9jb25zb2xlLmxvZyhcInVzaW5nIG5hdGl2ZSBwbGF5YmFja1wiKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG5ldyBOYXRpdmVQbGF5ZXIodmlkZW8sIG9wdGlvbnMpKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfSBlbHNlIGlmIChpc0h0bWxQbGF5YmFja1N1cHBvcnRlZCgpKSB7XG4gICAgICAgICAgICAvL2NvbnNvbGUubG9nKFwiZmFsbGluZyBiYWNrIHRvIHVwbHluayBwbGF5ZXJcIik7XG4gICAgICAgICAgICBsb2FkVXBseW5rQWRhcHRpdmVQbGF5ZXIodmlkZW8sIG9wdGlvbnMsIGNhbGxiYWNrKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChpc0h0bWxQbGF5YmFja1N1cHBvcnRlZCgpKSB7XG4gICAgICAgICAgICAvL2NvbnNvbGUubG9nKFwidXNpbmcgdXBseW5rIHBsYXllclwiKTtcbiAgICAgICAgICAgIGxvYWRVcGx5bmtBZGFwdGl2ZVBsYXllcih2aWRlbywgb3B0aW9ucywgY2FsbGJhY2spO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9IGVsc2UgaWYgKGlzTmF0aXZlUGxheWJhY2tTdXBwb3J0ZWQoKSkge1xuICAgICAgICAgICAgLy9jb25zb2xlLmxvZyhcImZhbGxpbmcgYmFjayB0byBuYXRpdmUgcGxheWJhY2tcIik7XG4gICAgICAgICAgICBjYWxsYmFjayhuZXcgTmF0aXZlUGxheWVyKHZpZGVvLCBvcHRpb25zKSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICB9XG4gICAgY29uc29sZS53YXJuKFwibm8gcGxheWJhY2sgbW9kZSBzdXBwb3J0ZWRcIik7XG4gICAgY2FsbGJhY2sodW5kZWZpbmVkKTtcbn1cblxuKDxhbnk+d2luZG93KS5jcmVhdGVBZGFwdGl2ZVBsYXllciA9IGNyZWF0ZUFkYXB0aXZlUGxheWVyO1xuKDxhbnk+d2luZG93KS5BZGFwdGl2ZVBsYXllciA9IEFkYXB0aXZlUGxheWVyOyIsImltcG9ydCB7IFN0cmluZ01hcCB9IGZyb20gJy4vc3RyaW5nLW1hcCc7XG5cbi8vaHR0cDovL3d3dy5kYXRjaGxleS5uYW1lL2VzNi1ldmVudGVtaXR0ZXIvXG4vL2h0dHBzOi8vZ2lzdC5naXRodWIuY29tL2RhdGNobGV5LzM3MzUzZDZhMmNiNjI5Njg3ZWI5XG4vL2h0dHA6Ly9jb2RlcGVuLmlvL3l1a3VsZWxlL3Blbi95TlZWeFYvP2VkaXRvcnM9MDAxXG5leHBvcnQgY2xhc3MgT2JzZXJ2YWJsZSB7XG4gICAgcHJpdmF0ZSBfbGlzdGVuZXJzOiBTdHJpbmdNYXA8YW55PjtcblxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB0aGlzLl9saXN0ZW5lcnMgPSBuZXcgU3RyaW5nTWFwKCk7XG4gICAgfVxuXG4gICAgb24obGFiZWw6IHN0cmluZywgY2FsbGJhY2s6IGFueSkge1xuICAgICAgICB0aGlzLl9saXN0ZW5lcnMuaGFzKGxhYmVsKSB8fCB0aGlzLl9saXN0ZW5lcnMuc2V0KGxhYmVsLCBbXSk7XG4gICAgICAgIHRoaXMuX2xpc3RlbmVycy5nZXQobGFiZWwpLnB1c2goY2FsbGJhY2spO1xuICAgIH1cblxuICAgIG9mZihsYWJlbDogc3RyaW5nLCBjYWxsYmFjazogYW55KSB7XG4gICAgICAgIGxldCBsaXN0ZW5lcnMgPSB0aGlzLl9saXN0ZW5lcnMuZ2V0KGxhYmVsKTtcbiAgICAgICAgbGV0IGluZGV4OiBudW1iZXI7XG5cbiAgICAgICAgaWYgKGxpc3RlbmVycyAmJiBsaXN0ZW5lcnMubGVuZ3RoKSB7XG4gICAgICAgICAgICBpbmRleCA9IGxpc3RlbmVycy5yZWR1Y2UoKGk6IG51bWJlciwgbGlzdGVuZXI6IGFueSwgaW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiAodGhpcy5faXNGdW5jdGlvbihsaXN0ZW5lcikgJiYgbGlzdGVuZXIgPT09IGNhbGxiYWNrKSA/IGkgPSBpbmRleCA6IGk7XG4gICAgICAgICAgICB9LCAtMSk7XG5cbiAgICAgICAgICAgIGlmIChpbmRleCA+IC0xKSB7XG4gICAgICAgICAgICAgICAgbGlzdGVuZXJzLnNwbGljZShpbmRleCwgMSk7XG4gICAgICAgICAgICAgICAgdGhpcy5fbGlzdGVuZXJzLnNldChsYWJlbCwgbGlzdGVuZXJzKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgZmlyZShsYWJlbDogc3RyaW5nLCAuLi5hcmdzOiBhbnlbXSkge1xuICAgICAgICBsZXQgbGlzdGVuZXJzID0gdGhpcy5fbGlzdGVuZXJzLmdldChsYWJlbCk7XG5cbiAgICAgICAgaWYgKGxpc3RlbmVycyAmJiBsaXN0ZW5lcnMubGVuZ3RoKSB7XG4gICAgICAgICAgICBsaXN0ZW5lcnMuZm9yRWFjaCgobGlzdGVuZXI6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIGxpc3RlbmVyKC4uLmFyZ3MpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfaXNGdW5jdGlvbihvYmo6IGFueSkge1xuICAgICAgICByZXR1cm4gdHlwZW9mIG9iaiA9PSAnZnVuY3Rpb24nIHx8IGZhbHNlO1xuICAgIH1cbn0iLCJpbXBvcnQgeyBBZEJyZWFrIH0gZnJvbSAnLi4vYWQvYWQtYnJlYWsnO1xuXG5leHBvcnQgY2xhc3MgU2VnbWVudE1hcCB7XG4gICAgcHJpdmF0ZSByZWFkb25seSBfc2VnbWVudHM6IFNlZ21lbnRbXTtcbiAgICBwcml2YXRlIHJlYWRvbmx5IF9hZEJyZWFrczogQWRCcmVha1tdO1xuXG4gICAgY29uc3RydWN0b3Ioc2VnbWVudHM6IFNlZ21lbnRbXSkge1xuICAgICAgICB0aGlzLl9zZWdtZW50cyA9IHNlZ21lbnRzO1xuICAgICAgICB0aGlzLl9hZEJyZWFrcyA9IFtdO1xuICAgICAgICB0aGlzLl9pbml0QWRicmVha3MoKTtcbiAgICB9XG5cbiAgICBmaW5kU2VnbWVudCh0aW1lOiBudW1iZXIpOiBTZWdtZW50IHwgdW5kZWZpbmVkIHtcbiAgICAgICAgbGV0IGluZGV4ID0gdGhpcy5nZXRTZWdtZW50SW5kZXhBdCh0aW1lKTtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0U2VnbWVudEF0KGluZGV4KTtcbiAgICB9XG5cbiAgICBnZXRTZWdtZW50QXQoaW5kZXg6IG51bWJlcik6IFNlZ21lbnQge1xuICAgICAgICBpZiAoaW5kZXggPj0gMCAmJiBpbmRleCA8IHRoaXMuX3NlZ21lbnRzLmxlbmd0aCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3NlZ21lbnRzW2luZGV4XTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgZ2V0U2VnbWVudEluZGV4QXQodGltZTogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9zZWdtZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgbGV0IHNlZ21lbnQgPSB0aGlzLl9zZWdtZW50c1tpXTtcbiAgICAgICAgICAgIGlmIChzZWdtZW50LnN0YXJ0VGltZSA8PSB0aW1lICYmIHRpbWUgPD0gc2VnbWVudC5lbmRUaW1lKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gLTE7XG4gICAgfVxuXG4gICAgZ2V0IGxlbmd0aCgpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5fc2VnbWVudHMubGVuZ3RoO1xuICAgIH1cblxuICAgIGdldCBhZEJyZWFrcygpOiBBZEJyZWFrW10ge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRCcmVha3M7XG4gICAgfVxuXG4gICAgZ2V0IGNvbnRlbnRTZWdtZW50cygpOiBTZWdtZW50W10ge1xuICAgICAgICByZXR1cm4gdGhpcy5fc2VnbWVudHMuZmlsdGVyKFNlZ21lbnRNYXAuaXNDb250ZW50KTtcbiAgICB9XG5cbiAgICBzdGF0aWMgaXNBZChzZWdtZW50OiBTZWdtZW50KTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiBzZWdtZW50LnR5cGUgPT09IFwiQURcIjtcbiAgICB9XG5cbiAgICBzdGF0aWMgaXNDb250ZW50KHNlZ21lbnQ6IFNlZ21lbnQpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHNlZ21lbnQudHlwZSA9PT0gXCJDT05URU5UXCI7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfaW5pdEFkYnJlYWtzKCk6IHZvaWQge1xuICAgICAgICBsZXQgYWRzOiBTZWdtZW50W10gPSBbXTtcblxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX3NlZ21lbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB3aGlsZSAoaSA8IHRoaXMuX3NlZ21lbnRzLmxlbmd0aCAmJiBTZWdtZW50TWFwLmlzQWQodGhpcy5fc2VnbWVudHNbaV0pKSB7XG4gICAgICAgICAgICAgICAgYWRzLnB1c2godGhpcy5fc2VnbWVudHNbaV0pO1xuICAgICAgICAgICAgICAgIGkrK1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoYWRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9hZEJyZWFrcy5wdXNoKG5ldyBBZEJyZWFrKGFkcykpO1xuICAgICAgICAgICAgICAgIGFkcyA9IFtdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgaW5BZEJyZWFrKHRpbWU6IG51bWJlcik6IGJvb2xlYW4ge1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX2FkQnJlYWtzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBsZXQgYWRCcmVhayA9IHRoaXMuX2FkQnJlYWtzW2ldO1xuICAgICAgICAgICAgaWYgKGFkQnJlYWsuY29udGFpbnModGltZSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBnZXRBZEJyZWFrKHRpbWU6IG51bWJlcik6IEFkQnJlYWsge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRCcmVha3MuZmluZCgoYWRCcmVhazogQWRCcmVhayk6IGJvb2xlYW4gPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGFkQnJlYWsuY29udGFpbnModGltZSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGdldEFkQnJlYWtzQmV0d2VlbihzdGFydDogbnVtYmVyLCBlbmQ6IG51bWJlcik6IEFkQnJlYWtbXSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZEJyZWFrcy5maWx0ZXIoKGFkQnJlYWs6IEFkQnJlYWspOiBib29sZWFuID0+IHtcbiAgICAgICAgICAgIHJldHVybiBzdGFydCA8PSBhZEJyZWFrLnN0YXJ0VGltZSAmJiBhZEJyZWFrLmVuZFRpbWUgPD0gZW5kO1xuICAgICAgICB9KTtcbiAgICB9XG59IiwiZXhwb3J0IGNsYXNzIFN0cmluZ01hcDxWPiB7XG4gICAgcHJpdmF0ZSBfbWFwOiBhbnk7XG5cbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgdGhpcy5fbWFwID0gbmV3IE9iamVjdCgpO1xuICAgIH1cblxuICAgIGdldCBzaXplKCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiBPYmplY3Qua2V5cyh0aGlzLl9tYXApLmxlbmd0aDtcbiAgICB9XG5cbiAgICBoYXMoa2V5OiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX21hcC5oYXNPd25Qcm9wZXJ0eShrZXkpO1xuICAgIH1cblxuICAgIGdldChrZXk6IHN0cmluZykge1xuICAgICAgICByZXR1cm4gdGhpcy5fbWFwW2tleV07XG4gICAgfVxuXG4gICAgc2V0KGtleTogc3RyaW5nLCB2YWx1ZTogVikge1xuICAgICAgICB0aGlzLl9tYXBba2V5XSA9IHZhbHVlO1xuICAgIH1cblxuICAgIGNsZWFyKCk6IHZvaWQge1xuICAgICAgICBjb25zdCBrZXlzID0gT2JqZWN0LmtleXModGhpcy5fbWFwKTtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBrZXlzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBrZXkgPSBrZXlzW2ldO1xuICAgICAgICAgICAgdGhpcy5fbWFwW2tleV0gPSBudWxsO1xuICAgICAgICAgICAgZGVsZXRlIHRoaXMuX21hcFtrZXldO1xuICAgICAgICB9XG4gICAgfVxufSIsImltcG9ydCB7IHRvSGV4U3RyaW5nIH0gZnJvbSAnLi91dGlscyc7XG5pbXBvcnQgeyBUaHVtYiwgQXNzZXRJbmZvLCBBc3NldEluZm9TZXJ2aWNlIH0gZnJvbSAnLi4vd2ViLXNlcnZpY2VzL2Fzc2V0LWluZm8tc2VydmljZSc7XG5pbXBvcnQgeyBTZWdtZW50TWFwIH0gZnJvbSAnLi9zZWdtZW50LW1hcCc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVGh1bWJuYWlsIHtcbiAgICB1cmw6IHN0cmluZztcbiAgICBoZWlnaHQ6IG51bWJlcjtcbiAgICB3aWR0aDogbnVtYmVyO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0VGh1bWJuYWlsKHRpbWU6IG51bWJlciwgc2VnbWVudHM6IFNlZ21lbnRNYXAsIGFzc2V0SW5mb1NlcnZpY2U6IEFzc2V0SW5mb1NlcnZpY2UsIHRodW1ibmFpbFNpemU6IFwic21hbGxcIiB8IFwibGFyZ2VcIiA9IFwic21hbGxcIik6IFRodW1ibmFpbCB7XG4gICAgaWYgKGlzTmFOKHRpbWUpIHx8IHRpbWUgPCAwKSB7XG4gICAgICAgIHRpbWUgPSAwO1xuICAgIH1cblxuICAgIGlmIChhc3NldEluZm9TZXJ2aWNlKSB7XG4gICAgICAgIGNvbnN0IHNlZ21lbnQgPSBzZWdtZW50cy5maW5kU2VnbWVudCh0aW1lKTtcbiAgICAgICAgaWYgKHNlZ21lbnQpIHtcbiAgICAgICAgICAgIGNvbnN0IGFzc2V0ID0gYXNzZXRJbmZvU2VydmljZS5nZXRBc3NldEluZm8oc2VnbWVudC5pZCk7XG4gICAgICAgICAgICBpZiAoYXNzZXQgJiYgYXNzZXQudGh1bWJzKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgc2xpY2VOdW1iZXIgPSBnZXRTbGljZU51bWJlcih0aW1lLCBzZWdtZW50LCBhc3NldCk7XG4gICAgICAgICAgICAgICAgY29uc3QgdGh1bWIgPSBnZXRUaHVtYihhc3NldCwgdGh1bWJuYWlsU2l6ZSk7XG5cbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICB1cmw6IGdldFRodW1ibmFpbFVybChhc3NldCwgc2xpY2VOdW1iZXIsIHRodW1iKSxcbiAgICAgICAgICAgICAgICAgICAgaGVpZ2h0OiB0aHVtYi5oZWlnaHQsXG4gICAgICAgICAgICAgICAgICAgIHdpZHRoOiB0aHVtYi53aWR0aFxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICAgIHVybDogJycsXG4gICAgICAgIGhlaWdodDogMCxcbiAgICAgICAgd2lkdGg6IDBcbiAgICB9O1xufVxuXG5mdW5jdGlvbiBnZXRUaHVtYm5haWxVcmwoYXNzZXQ6IEFzc2V0SW5mbywgc2xpY2VOdW1iZXI6IG51bWJlciwgdGh1bWI6IFRodW1iKTogc3RyaW5nIHtcbiAgICBsZXQgcHJlZml4ID0gYXNzZXQudGh1bWJQcmVmaXg7XG5cbiAgICBpZiAoYXNzZXQuc3RvcmFnZVBhcnRpdGlvbnMgJiYgYXNzZXQuc3RvcmFnZVBhcnRpdGlvbnMubGVuZ3RoKSB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYXNzZXQuc3RvcmFnZVBhcnRpdGlvbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IHBhcnRpdGlvbiA9IGFzc2V0LnN0b3JhZ2VQYXJ0aXRpb25zW2ldO1xuICAgICAgICAgICAgaWYgKHBhcnRpdGlvbi5zdGFydCA8PSBzbGljZU51bWJlciAmJiBzbGljZU51bWJlciA8IHBhcnRpdGlvbi5lbmQpIHtcbiAgICAgICAgICAgICAgICBwcmVmaXggPSBwYXJ0aXRpb24udXJsO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHByZWZpeFtwcmVmaXgubGVuZ3RoIC0gMV0gIT09ICcvJykge1xuICAgICAgICBwcmVmaXggKz0gJy8nO1xuICAgIH1cblxuICAgIGNvbnN0IHNsaWNlSGV4TnVtYmVyID0gdG9IZXhTdHJpbmcoc2xpY2VOdW1iZXIpO1xuXG4gICAgcmV0dXJuIGAke3ByZWZpeH0ke3RodW1iLnByZWZpeH0ke3NsaWNlSGV4TnVtYmVyfS5qcGdgO1xufVxuXG5mdW5jdGlvbiBnZXRUaHVtYihhc3NldDogQXNzZXRJbmZvLCBzaXplOiAnc21hbGwnIHwgJ2xhcmdlJyk6IFRodW1iIHtcbiAgICAvL2RlZmF1bHQgdG8gc21hbGxlc3QgdGh1bWJcbiAgICBsZXQgdGh1bWI6IFRodW1iID0gYXNzZXQudGh1bWJzWzBdO1xuXG4gICAgaWYgKHNpemUgPT09IFwibGFyZ2VcIikge1xuICAgICAgICAvL2xhc3QgdGh1bWIgaXMgdGhlIGxhcmdlc3RcbiAgICAgICAgdGh1bWIgPSBhc3NldC50aHVtYnNbYXNzZXQudGh1bWJzLmxlbmd0aCAtIDFdO1xuICAgIH1cblxuICAgIHJldHVybiB0aHVtYjtcbn1cblxuXG5mdW5jdGlvbiBnZXRTbGljZU51bWJlcih0aW1lOiBudW1iZXIsIHNlZ21lbnQ6IFNlZ21lbnQsIGFzc2V0OiBBc3NldEluZm8pOiBudW1iZXIge1xuICAgIGxldCBzbGljZU51bWJlciA9IE1hdGguY2VpbCgodGltZSAtIHNlZ21lbnQuc3RhcnRUaW1lKSAvIGFzc2V0LnNsaWNlRHVyYXRpb24pO1xuICAgIHNsaWNlTnVtYmVyICs9IHNlZ21lbnQuaW5kZXg7XG5cbiAgICBpZiAoc2xpY2VOdW1iZXIgPiBhc3NldC5tYXhTbGljZSkge1xuICAgICAgICBzbGljZU51bWJlciA9IGFzc2V0Lm1heFNsaWNlO1xuICAgIH1cblxuICAgIHJldHVybiBzbGljZU51bWJlcjtcbn1cbiIsImV4cG9ydCBmdW5jdGlvbiB0b1RpbWVTdHJpbmcodGltZTogbnVtYmVyKSB7XG4gICAgaWYgKGlzTmFOKHRpbWUpKSB7XG4gICAgICAgIHRpbWUgPSAwO1xuICAgIH1cblxuICAgIGxldCBuZWdhdGl2ZSA9ICh0aW1lIDwgMCkgPyBcIi1cIiA6IFwiXCI7XG5cbiAgICB0aW1lID0gTWF0aC5hYnModGltZSk7XG5cbiAgICBsZXQgc2Vjb25kcyA9ICh0aW1lICUgNjApIHwgMDtcbiAgICBsZXQgbWludXRlcyA9ICgodGltZSAvIDYwKSAlIDYwKSB8IDA7XG4gICAgbGV0IGhvdXJzID0gKCgodGltZSAvIDYwKSAvIDYwKSAlIDYwKSB8IDA7XG4gICAgbGV0IHNob3dIb3VycyA9IGhvdXJzID4gMDtcblxuICAgIGxldCBoclN0ciA9IGhvdXJzIDwgMTAgPyBgMCR7aG91cnN9YCA6IGAke2hvdXJzfWA7XG4gICAgbGV0IG1pblN0ciA9IG1pbnV0ZXMgPCAxMCA/IGAwJHttaW51dGVzfWAgOiBgJHttaW51dGVzfWA7XG4gICAgbGV0IHNlY1N0ciA9IHNlY29uZHMgPCAxMCA/IGAwJHtzZWNvbmRzfWAgOiBgJHtzZWNvbmRzfWA7XG5cbiAgICBpZiAoc2hvd0hvdXJzKSB7XG4gICAgICAgIHJldHVybiBgJHtuZWdhdGl2ZX0ke2hyU3RyfToke21pblN0cn06JHtzZWNTdHJ9YDtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gYCR7bmVnYXRpdmV9JHttaW5TdHJ9OiR7c2VjU3RyfWA7XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gdG9IZXhTdHJpbmcobnVtYmVyOiBudW1iZXIsIG1pbkxlbmd0aCA9IDgpOiBzdHJpbmcge1xuICAgIGxldCBoZXggPSBudW1iZXIudG9TdHJpbmcoMTYpLnRvVXBwZXJDYXNlKCk7XG4gICAgd2hpbGUgKGhleC5sZW5ndGggPCBtaW5MZW5ndGgpIHtcbiAgICAgICAgaGV4ID0gXCIwXCIgKyBoZXg7XG4gICAgfVxuXG4gICAgcmV0dXJuIGhleDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGJhc2U2NFRvQnVmZmVyKGI2NGVuY29kZWQ6IHN0cmluZyk6IFVpbnQ4QXJyYXkge1xuICAgIHJldHVybiBuZXcgVWludDhBcnJheShhdG9iKGI2NGVuY29kZWQpLnNwbGl0KFwiXCIpLm1hcChmdW5jdGlvbiAoYykgeyByZXR1cm4gYy5jaGFyQ29kZUF0KDApOyB9KSlcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNsaWNlKGRhdGE6IFVpbnQ4QXJyYXksIHN0YXJ0OiBudW1iZXIsIGVuZD86IG51bWJlcik6IFVpbnQ4QXJyYXkge1xuICAgIC8vSUUgMTEgZG9lc24ndCBzdXBwb3J0IHNsaWNlKCkgb24gVHlwZWRBcnJheSBvYmplY3RzXG4gICAgaWYgKGRhdGEuc2xpY2UpIHtcbiAgICAgICAgcmV0dXJuIGRhdGEuc2xpY2Uoc3RhcnQsIGVuZCk7XG4gICAgfVxuXG4gICAgaWYgKGVuZCkge1xuICAgICAgICByZXR1cm4gZGF0YS5zdWJhcnJheShzdGFydCwgZW5kKTtcbiAgICB9XG5cbiAgICByZXR1cm4gZGF0YS5zdWJhcnJheShzdGFydCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0xvY2FsU3RvcmFnZUF2YWlsYWJsZSgpXG57XG4gICAgLy8gQ29waWVkIGZyb20gUGx5ciBjb2RlXG4gICAgaWYgKCEoJ2xvY2FsU3RvcmFnZScgaW4gd2luZG93KSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgLy8gVHJ5IHRvIHVzZSBpdCAoaXQgbWlnaHQgYmUgZGlzYWJsZWQsIGUuZy4gdXNlciBpcyBpbiBwcml2YXRlIG1vZGUpXG4gICAgLy8gc2VlOiBodHRwczovL2dpdGh1Yi5jb20vU2Vsei9wbHlyL2lzc3Vlcy8xMzFcbiAgICB0cnkge1xuICAgICAgICAvLyBBZGQgdGVzdCBpdGVtXG4gICAgICAgIHdpbmRvdy5sb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnX19fdGVzdCcsICdPSycpO1xuXG4gICAgICAgIC8vIEdldCB0aGUgdGVzdCBpdGVtXG4gICAgICAgIHZhciByZXN1bHQgPSB3aW5kb3cubG9jYWxTdG9yYWdlLmdldEl0ZW0oJ19fX3Rlc3QnKTtcblxuICAgICAgICAvLyBDbGVhbiB1cFxuICAgICAgICB3aW5kb3cubG9jYWxTdG9yYWdlLnJlbW92ZUl0ZW0oJ19fX3Rlc3QnKTtcblxuICAgICAgICAvLyBDaGVjayBpZiB2YWx1ZSBtYXRjaGVzXG4gICAgICAgIHJldHVybiAocmVzdWx0ID09PSAnT0snKTtcbiAgICB9XG4gICAgY2F0Y2ggKGUpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFByb3RvY29sKHVybDogc3RyaW5nKTogc3RyaW5nIHtcbiAgICB0cnkge1xuICAgICAgICAvL25vdCBhbGwgYnJvd3NlcnMgc3VwcG9ydCBVUkwgYXBpIChJRTExLi4uKVxuICAgICAgICByZXR1cm4gbmV3IFVSTCh1cmwpLnByb3RvY29sO1xuICAgIH0gY2F0Y2ggKF8pIHsgfVxuXG4gICAgdmFyIGxpbmsgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XG4gICAgbGluay5zZXRBdHRyaWJ1dGUoJ2hyZWYnLCB1cmwpO1xuXG4gICAgcmV0dXJuIGxpbmsucHJvdG9jb2w7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0lFMTFPckVkZ2UoKTogYm9vbGVhbiB7XG4gICAgbGV0IGlzSUUxMSA9IChuYXZpZ2F0b3IuYXBwVmVyc2lvbi5pbmRleE9mKCdXaW5kb3dzIE5UJykgIT09IC0xKSAmJiAobmF2aWdhdG9yLmFwcFZlcnNpb24uaW5kZXhPZigncnY6MTEnKSAhPT0gLTEpO1xuICAgIGxldCBpc0VkZ2UgPSBuYXZpZ2F0b3IuYXBwVmVyc2lvbi5pbmRleE9mKCdFZGdlJykgIT09IC0xO1xuICAgIHJldHVybiBpc0lFMTEgfHwgaXNFZGdlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc3RyaW5nVG9BcnJheTE2KHN0cmluZ0RhdGE6IHN0cmluZyk6IFVpbnQxNkFycmF5IHtcbiAgICBsZXQgYnVmZmVyID0gbmV3IEFycmF5QnVmZmVyKHN0cmluZ0RhdGEubGVuZ3RoICogMik7IC8vIDIgYnl0ZXMgZm9yIGVhY2ggY2hhclxuICAgIGxldCBhcnJheSA9IG5ldyBVaW50MTZBcnJheShidWZmZXIpO1xuICAgIGZvciAobGV0IGkgPSAwLCBzdHJMZW4gPSBzdHJpbmdEYXRhLmxlbmd0aDsgaSA8IHN0ckxlbjsgaSsrKSB7XG4gICAgICAgIGFycmF5W2ldID0gc3RyaW5nRGF0YS5jaGFyQ29kZUF0KGkpO1xuICAgIH1cbiAgICByZXR1cm4gYXJyYXk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhcnJheTE2VG9TdHJpbmcoYXJyYXk6IFVpbnQxNkFycmF5KTogU3RyaW5nIHtcbiAgICBsZXQgdWludDE2YXJyYXkgPSBuZXcgVWludDE2QXJyYXkoYXJyYXkuYnVmZmVyKTtcbiAgICByZXR1cm4gU3RyaW5nLmZyb21DaGFyQ29kZS5hcHBseShudWxsLCB1aW50MTZhcnJheSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBiYXNlNjREZWNvZGVVaW50OEFycmF5KGlucHV0OiBhbnkpOiBVaW50OEFycmF5IHtcbiAgICBsZXQgcmF3ID0gd2luZG93LmF0b2IoaW5wdXQpO1xuICAgIGxldCByYXdMZW5ndGggPSByYXcubGVuZ3RoO1xuICAgIGxldCBhcnJheSA9IG5ldyBVaW50OEFycmF5KG5ldyBBcnJheUJ1ZmZlcihyYXdMZW5ndGgpKTtcblxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcmF3TGVuZ3RoOyBpKyspXG4gICAgICAgIGFycmF5W2ldID0gcmF3LmNoYXJDb2RlQXQoaSk7XG5cbiAgICByZXR1cm4gYXJyYXk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBiYXNlNjRFbmNvZGVVaW50OEFycmF5KGlucHV0OiBVaW50OEFycmF5KTogc3RyaW5nIHtcbiAgICBsZXQga2V5U3RyID0gXCJBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWmFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6MDEyMzQ1Njc4OSsvPVwiO1xuICAgIGxldCBvdXRwdXQgPSBcIlwiO1xuICAgIGxldCBjaHIxLCBjaHIyLCBjaHIzLCBlbmMxLCBlbmMyLCBlbmMzLCBlbmM0O1xuICAgIGxldCBpID0gMDtcblxuICAgIHdoaWxlIChpIDwgaW5wdXQubGVuZ3RoKSB7XG4gICAgICAgIGNocjEgPSBpbnB1dFtpKytdO1xuICAgICAgICBjaHIyID0gaSA8IGlucHV0Lmxlbmd0aCA/IGlucHV0W2krK10gOiBOdW1iZXIuTmFOOyAvLyBOb3Qgc3VyZSBpZiB0aGUgaW5kZXhcbiAgICAgICAgY2hyMyA9IGkgPCBpbnB1dC5sZW5ndGggPyBpbnB1dFtpKytdIDogTnVtYmVyLk5hTjsgLy8gY2hlY2tzIGFyZSBuZWVkZWQgaGVyZVxuXG4gICAgICAgIGVuYzEgPSBjaHIxID4+IDI7XG4gICAgICAgIGVuYzIgPSAoKGNocjEgJiAzKSA8PCA0KSB8IChjaHIyID4+IDQpO1xuICAgICAgICBlbmMzID0gKChjaHIyICYgMTUpIDw8IDIpIHwgKGNocjMgPj4gNik7XG4gICAgICAgIGVuYzQgPSBjaHIzICYgNjM7XG5cbiAgICAgICAgaWYgKGlzTmFOKGNocjIpKSB7XG4gICAgICAgICAgICBlbmMzID0gZW5jNCA9IDY0O1xuICAgICAgICB9IGVsc2UgaWYgKGlzTmFOKGNocjMpKSB7XG4gICAgICAgICAgICBlbmM0ID0gNjQ7XG4gICAgICAgIH1cbiAgICAgICAgb3V0cHV0ICs9IGtleVN0ci5jaGFyQXQoZW5jMSkgKyBrZXlTdHIuY2hhckF0KGVuYzIpICtcbiAgICAgICAgICAgIGtleVN0ci5jaGFyQXQoZW5jMykgKyBrZXlTdHIuY2hhckF0KGVuYzQpO1xuICAgIH1cbiAgICByZXR1cm4gb3V0cHV0O1xufSIsImltcG9ydCB7IFNlZ21lbnRNYXAgfSBmcm9tICcuLi91dGlscy9zZWdtZW50LW1hcCc7XG5pbXBvcnQgeyBTdHJpbmdNYXAgfSBmcm9tICcuLi91dGlscy9zdHJpbmctbWFwJztcblxuY29uc3QgZW51bSBUdlJhdGluZyB7XG4gICAgTm90QXZhaWxhYmxlID0gLTEsXG4gICAgTm90QXBwbGljYWJsZSA9IDAsXG4gICAgVFZfWSA9IDEsXG4gICAgVFZfWTcgPSAyLFxuICAgIFRWX0cgPSAzLFxuICAgIFRWX1BHID0gNCxcbiAgICBUVl8xNCA9IDUsXG4gICAgVFZfTUEgPSA2LFxuICAgIE5vdFJhdGVkID0gN1xufVxuXG5jb25zdCBlbnVtIE1vdmllUmF0aW5nIHtcbiAgICBOb3RBdmFpbGFibGUgPSAtMSxcbiAgICBOb3RBcHBsaWNhYmxlID0gMCxcbiAgICBHID0gMSxcbiAgICBQRyA9IDIsXG4gICAgUEdfMTMgPSAzLFxuICAgIFIgPSA0LFxuICAgIE5DXzE3ID0gNSxcbiAgICBYID0gNixcbiAgICBOb3RSYXRlZCA9IDdcbn1cblxuZXhwb3J0IGludGVyZmFjZSBUaHVtYiB7XG4gICAgd2lkdGg6IG51bWJlcjtcbiAgICBwcmVmaXg6IHN0cmluZztcbiAgICBoZWlnaHQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdG9yYWdlUGFyaXRpb24ge1xuICAgIC8qKlxuICAgICAqIFN0YXJ0aW5nIHNsaWNlIG51bWJlciwgaW5jbHVzaXZlXG4gICAgICovXG4gICAgc3RhcnQ6IG51bWJlcjtcblxuICAgIC8qKlxuICAgICAqIEVuZGluZyBzbGljZSBudW1iZXIsIGV4Y2x1c2l2ZVxuICAgICAqL1xuICAgIGVuZDogbnVtYmVyO1xuICAgIHVybDogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgQXNzZXRJbmZvU2VyaWFsaXplZCB7XG4gICAgYXVkaW9fb25seTogbnVtYmVyO1xuICAgIGVycm9yOiBudW1iZXI7XG4gICAgdHZfcmF0aW5nOiBudW1iZXI7XG4gICAgc3RvcmFnZV9wYXJ0aXRpb25zOiBTdG9yYWdlUGFyaXRpb25bXTtcbiAgICBtYXhfc2xpY2U6IG51bWJlcjtcbiAgICB0aHVtYl9wcmVmaXg6IHN0cmluZztcbiAgICBhZF9kYXRhOiBPYmplY3Q7XG4gICAgc2xpY2VfZHVyOiBudW1iZXI7XG4gICAgbW92aWVfcmF0aW5nOiBudW1iZXI7XG4gICAgb3duZXI6IHN0cmluZztcbiAgICByYXRlczogbnVtYmVyW107XG4gICAgdGh1bWJzOiBUaHVtYltdO1xuICAgIHBvc3Rlcl91cmw6IHN0cmluZztcbiAgICBkdXJhdGlvbjogbnVtYmVyO1xuICAgIGRlZmF1bHRfcG9zdGVyX3VybDogc3RyaW5nO1xuICAgIGRlc2M6IHN0cmluZztcbiAgICByYXRpbmdfZmxhZ3M6IG51bWJlcjtcbiAgICBleHRlcm5hbF9pZDogc3RyaW5nO1xuICAgIGlzX2FkOiBudW1iZXI7XG4gICAgYXNzZXQ6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIEFkRGF0YSB7XG4gICAgY2xpY2s/OiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGNsYXNzIEFzc2V0SW5mbyB7XG4gICAgcmVhZG9ubHkgYXVkaW9Pbmx5OiBib29sZWFuO1xuICAgIHJlYWRvbmx5IGVycm9yOiBib29sZWFuO1xuICAgIHJlYWRvbmx5IHR2UmF0aW5nOiBUdlJhdGluZztcbiAgICByZWFkb25seSBzdG9yYWdlUGFydGl0aW9uczogU3RvcmFnZVBhcml0aW9uW107XG4gICAgcmVhZG9ubHkgbWF4U2xpY2U6IG51bWJlcjtcbiAgICByZWFkb25seSB0aHVtYlByZWZpeDogc3RyaW5nO1xuICAgIHJlYWRvbmx5IGFkRGF0YTogQWREYXRhO1xuICAgIHJlYWRvbmx5IHNsaWNlRHVyYXRpb246IG51bWJlcjtcbiAgICByZWFkb25seSBtb3ZpZVJhdGluZzogTW92aWVSYXRpbmc7XG4gICAgcmVhZG9ubHkgb3duZXI6IHN0cmluZztcbiAgICByZWFkb25seSByYXRlczogbnVtYmVyW107XG4gICAgcmVhZG9ubHkgdGh1bWJzOiBUaHVtYltdO1xuICAgIHJlYWRvbmx5IHBvc3RlclVybDogc3RyaW5nO1xuICAgIHJlYWRvbmx5IGR1cmF0aW9uOiBudW1iZXI7XG4gICAgcmVhZG9ubHkgZGVmYXVsdFBvc3RlclVybDogc3RyaW5nO1xuICAgIHJlYWRvbmx5IGRlc2NyaXB0aW9uOiBzdHJpbmc7XG4gICAgcmVhZG9ubHkgcmF0aW5nRmxhZ3M6IG51bWJlcjtcbiAgICByZWFkb25seSBleHRlcm5hbElkOiBzdHJpbmc7XG4gICAgcmVhZG9ubHkgaXNBZDogYm9vbGVhbjtcbiAgICByZWFkb25seSBhc3NldDogc3RyaW5nO1xuXG4gICAgY29uc3RydWN0b3Iob2JqOiBBc3NldEluZm9TZXJpYWxpemVkLCBpc0FkOiBib29sZWFuIHwgbnVsbCkge1xuICAgICAgICB0aGlzLmF1ZGlvT25seSA9IG9iai5hdWRpb19vbmx5ID09IDE7XG4gICAgICAgIHRoaXMuZXJyb3IgPSBvYmouZXJyb3IgPT0gMTtcbiAgICAgICAgdGhpcy50dlJhdGluZyA9IG9iai50dl9yYXRpbmc7XG4gICAgICAgIHRoaXMuc3RvcmFnZVBhcnRpdGlvbnMgPSBvYmouc3RvcmFnZV9wYXJ0aXRpb25zO1xuICAgICAgICB0aGlzLm1heFNsaWNlID0gb2JqLm1heF9zbGljZTtcbiAgICAgICAgdGhpcy50aHVtYlByZWZpeCA9IG9iai50aHVtYl9wcmVmaXg7XG4gICAgICAgIHRoaXMuYWREYXRhID0gb2JqLmFkX2RhdGE7XG4gICAgICAgIHRoaXMuc2xpY2VEdXJhdGlvbiA9IG9iai5zbGljZV9kdXI7XG4gICAgICAgIHRoaXMubW92aWVSYXRpbmcgPSBvYmoubW92aWVfcmF0aW5nO1xuICAgICAgICB0aGlzLm93bmVyID0gb2JqLm93bmVyO1xuICAgICAgICB0aGlzLnJhdGVzID0gb2JqLnJhdGVzO1xuICAgICAgICB0aGlzLnRodW1icyA9IG9iai50aHVtYnM7XG4gICAgICAgIHRoaXMucG9zdGVyVXJsID0gb2JqLnBvc3Rlcl91cmw7XG4gICAgICAgIHRoaXMuZHVyYXRpb24gPSBvYmouZHVyYXRpb247XG4gICAgICAgIHRoaXMuZGVmYXVsdFBvc3RlclVybCA9IG9iai5kZWZhdWx0X3Bvc3Rlcl91cmw7XG4gICAgICAgIHRoaXMuZGVzY3JpcHRpb24gPSBvYmouZGVzYztcbiAgICAgICAgdGhpcy5yYXRpbmdGbGFncyA9IG9iai5yYXRpbmdfZmxhZ3M7XG4gICAgICAgIHRoaXMuZXh0ZXJuYWxJZCA9IG9iai5leHRlcm5hbF9pZDtcbiAgICAgICAgdGhpcy5hc3NldCA9IG9iai5hc3NldDtcblxuICAgICAgICAvL3VzZSB2YWx1ZSBmcm9tIFNlZ21lbnRNYXAgaWYgYXZhaWxhYmxlICgjMTE4LCBVUC00MzU0KVxuICAgICAgICBpZiAoaXNBZCA9PSBudWxsKSB7XG4gICAgICAgICAgICB0aGlzLmlzQWQgPSBvYmouaXNfYWQgPT09IDE7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmlzQWQgPSBpc0FkO1xuICAgICAgICB9XG5cbiAgICAgICAgLy9zb3J0IHRodW1icyBieSBpbWFnZSB3aWR0aCwgc21hbGxlc3QgdG8gbGFyZ2VzdFxuICAgICAgICAvLyB0aHVtYnMgbWF5IGJlIHVuZGVmaW5lZCB3aGVuIHBsYXlpbmcgYW4gYXVkaW8tb25seSBhc3NldFxuICAgICAgICBpZiAodGhpcy50aHVtYnMpIHtcbiAgICAgICAgICAgIHRoaXMudGh1bWJzLnNvcnQoZnVuY3Rpb24gKGxlZnQ6IFRodW1iLCByaWdodDogVGh1bWIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbGVmdC53aWR0aCAtIHJpZ2h0LndpZHRoO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICAvL2NsYW1wIHN0b3JhZ2UgcGFydGl0aW9uIHNsaWNlIGVuZCBudW1iZXJzIGFzIHRoZXkgY2FuIGJlIGxhcmdlciB0aGFuXG4gICAgICAgIC8vIGphdmFzY3JpcHQgY2FuIHNhZmVseSByZXByZXNlbnRcbiAgICAgICAgaWYgKHRoaXMuc3RvcmFnZVBhcnRpdGlvbnMgJiYgdGhpcy5zdG9yYWdlUGFydGl0aW9ucy5sZW5ndGgpIHtcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5zdG9yYWdlUGFydGl0aW9ucy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIC8vTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIgPT09IDkwMDcxOTkyNTQ3NDA5OTFcbiAgICAgICAgICAgICAgICAvL051bWJlci5NQVhfU0FGRV9JTlRFR0VSIG5vdCBzdXBwb3J0ZWQgaW4gSUVcbiAgICAgICAgICAgICAgICB0aGlzLnN0b3JhZ2VQYXJ0aXRpb25zW2ldLmVuZCA9IE1hdGgubWluKHRoaXMuc3RvcmFnZVBhcnRpdGlvbnNbaV0uZW5kLCA5MDA3MTk5MjU0NzQwOTkxKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn1cblxuZXhwb3J0IGNsYXNzIEFzc2V0SW5mb1NlcnZpY2Uge1xuICAgIHByaXZhdGUgcmVhZG9ubHkgX3Byb3RvY29sOiBzdHJpbmc7XG4gICAgcHJpdmF0ZSByZWFkb25seSBfZG9tYWluOiBzdHJpbmc7XG4gICAgcHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbklkOiBzdHJpbmc7XG4gICAgcHJpdmF0ZSByZWFkb25seSBfY2FjaGU6IFN0cmluZ01hcDxBc3NldEluZm8+O1xuXG4gICAgY29uc3RydWN0b3IocHJvdG9jb2w6IHN0cmluZywgZG9tYWluOiBzdHJpbmcsIHNlc3Npb25JZD86IHN0cmluZykge1xuICAgICAgICB0aGlzLl9wcm90b2NvbCA9IHByb3RvY29sO1xuICAgICAgICB0aGlzLl9kb21haW4gPSBkb21haW47XG4gICAgICAgIHRoaXMuX3Nlc3Npb25JZCA9IHNlc3Npb25JZDtcbiAgICAgICAgdGhpcy5fY2FjaGUgPSBuZXcgU3RyaW5nTWFwPEFzc2V0SW5mbz4oKTtcblxuICAgICAgICB0aGlzLl9sb2FkU2VnbWVudHMgPSB0aGlzLl9sb2FkU2VnbWVudHMuYmluZCh0aGlzKTtcbiAgICB9XG5cbiAgICBsb2FkU2VnbWVudE1hcChzZWdtZW50TWFwOiBTZWdtZW50TWFwLCBjYWxsYmFjazogKCkgPT4gdm9pZCk6IHZvaWQge1xuICAgICAgICBsZXQgc2VnbWVudHM6IFNlZ21lbnRbXSA9IFtdO1xuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc2VnbWVudE1hcC5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgbGV0IHNlZ21lbnQgPSBzZWdtZW50TWFwLmdldFNlZ21lbnRBdChpKTtcbiAgICAgICAgICAgIGlmIChzZWdtZW50LmlkICYmIHNlZ21lbnQuaWQgIT09ICcnKSB7XG4gICAgICAgICAgICAgICAgc2VnbWVudHMucHVzaChzZWdtZW50KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX2xvYWRTZWdtZW50cyhzZWdtZW50cywgY2FsbGJhY2spO1xuICAgIH1cblxuICAgIHByaXZhdGUgX2xvYWRTZWdtZW50cyhzZWdtZW50czogU2VnbWVudFtdLCBjYWxsYmFjazogKCkgPT4gdm9pZCk6IHZvaWQge1xuICAgICAgICBpZiAoc2VnbWVudHMubGVuZ3RoID09IDApIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKCk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgc2VnbWVudCA9IHNlZ21lbnRzLnNoaWZ0KCk7XG4gICAgICAgIHRoaXMubG9hZFNlZ21lbnQoc2VnbWVudCwgKCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5fbG9hZFNlZ21lbnRzKHNlZ21lbnRzLCBjYWxsYmFjayk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGxvYWRBc3NldElkKGFzc2V0SWQ6IHN0cmluZywgaXNBZDogYm9vbGVhbiB8IG51bGwsIGNhbGxCYWNrOiAoYXNzZXRJbmZvOiBBc3NldEluZm8pID0+IHZvaWQpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuaXNMb2FkZWQoYXNzZXRJZCkpIHtcbiAgICAgICAgICAgIC8vYXNzZXRJbmZvIGZvciBhc3NldElkIGlzIGFscmVhZHkgbG9hZGVkXG4gICAgICAgICAgICBsZXQgaW5mbyA9IHRoaXMuX2NhY2hlLmdldChhc3NldElkKTtcbiAgICAgICAgICAgIGNhbGxCYWNrKGluZm8pO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IHVybCA9IGAke3RoaXMuX3Byb3RvY29sfS8vJHt0aGlzLl9kb21haW59L3BsYXllci9hc3NldGluZm8vJHthc3NldElkfS5qc29uYDtcblxuICAgICAgICBpZiAodGhpcy5fc2Vzc2lvbklkICYmIHRoaXMuX3Nlc3Npb25JZCAhPSBcIlwiKSB7XG4gICAgICAgICAgICB1cmwgPSBgJHt1cmx9P3Bicz0ke3RoaXMuX3Nlc3Npb25JZH1gO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHhociA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xuICAgICAgICB4aHIub25sb2FkZW5kID0gKCk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgaWYgKHhoci5zdGF0dXMgPT0gMjAwKSB7XG4gICAgICAgICAgICAgICAgbGV0IG9iaiA9IEpTT04ucGFyc2UoeGhyLnJlc3BvbnNlVGV4dCk7XG4gICAgICAgICAgICAgICAgbGV0IGFzc2V0SW5mbyA9IG5ldyBBc3NldEluZm8ob2JqLCBpc0FkKTtcblxuICAgICAgICAgICAgICAgIC8vYWRkIGFzc2V0SW5mbyB0byBjYWNoZVxuICAgICAgICAgICAgICAgIHRoaXMuX2NhY2hlLnNldChhc3NldElkLCBhc3NldEluZm8pO1xuXG4gICAgICAgICAgICAgICAgY2FsbEJhY2soYXNzZXRJbmZvKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY2FsbEJhY2sobnVsbCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgeGhyLm9wZW4oXCJHRVRcIiwgdXJsKTtcbiAgICAgICAgeGhyLnNlbmQoKTtcbiAgICB9XG5cbiAgICBsb2FkU2VnbWVudChzZWdtZW50OiBTZWdtZW50LCBjYWxsQmFjazogKGFzc2V0SW5mbzogQXNzZXRJbmZvKSA9PiB2b2lkKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGFzc2V0SWQ6IHN0cmluZyA9IHNlZ21lbnQuaWQ7XG4gICAgICAgIGNvbnN0IGlzQWQgPSBTZWdtZW50TWFwLmlzQWQoc2VnbWVudCk7XG5cbiAgICAgICAgdGhpcy5sb2FkQXNzZXRJZChhc3NldElkLCBpc0FkLCBjYWxsQmFjayk7XG4gICAgfVxuXG4gICAgaXNMb2FkZWQoYXNzZXRJZDogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLl9jYWNoZS5oYXMoYXNzZXRJZCk7XG4gICAgfVxuXG4gICAgZ2V0QXNzZXRJbmZvKGFzc2V0SWQ6IHN0cmluZyk6IEFzc2V0SW5mbyB7XG4gICAgICAgIGlmICh0aGlzLmlzTG9hZGVkKGFzc2V0SWQpKSB7XG4gICAgICAgICAgICBsZXQgaW5mbyA9IHRoaXMuX2NhY2hlLmdldChhc3NldElkKTtcbiAgICAgICAgICAgIHJldHVybiBpbmZvO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICBjbGVhcigpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5fY2FjaGUuY2xlYXIoKTtcbiAgICB9XG59XG4iLCJleHBvcnQgY2xhc3MgUGluZ1NlcnZpY2Uge1xuICAgIHByaXZhdGUgcmVhZG9ubHkgX3Byb3RvY29sOiBzdHJpbmc7XG4gICAgcHJpdmF0ZSByZWFkb25seSBfZG9tYWluOiBzdHJpbmc7XG4gICAgcHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbklkOiBzdHJpbmc7XG4gICAgcHJpdmF0ZSByZWFkb25seSBfdmlkZW86IEhUTUxWaWRlb0VsZW1lbnQ7XG5cbiAgICBwcml2YXRlIF9waW5nU2VydmVyOiBib29sZWFuO1xuICAgIHByaXZhdGUgX3NlbnRTdGFydFBpbmc6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSBfc2Vla2luZzogYm9vbGVhbjtcblxuICAgIHByaXZhdGUgX2N1cnJlbnRUaW1lOiBudW1iZXI7XG4gICAgcHJpdmF0ZSBfc2Vla0Zyb21UaW1lOiBudW1iZXI7XG4gICAgcHJpdmF0ZSBfbmV4dFRpbWU6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuICAgIHByaXZhdGUgcmVhZG9ubHkgU1RBUlQgPSBcInN0YXJ0XCI7XG4gICAgcHJpdmF0ZSByZWFkb25seSBTRUVLID0gXCJzZWVrXCI7XG5cbiAgICBjb25zdHJ1Y3Rvcihwcm90b2NvbDogc3RyaW5nLCBkb21haW46IHN0cmluZywgc2Vzc2lvbklkOiBzdHJpbmcsIHZpZGVvOiBIVE1MVmlkZW9FbGVtZW50KSB7XG5cbiAgICAgICAgdGhpcy5fcHJvdG9jb2wgPSBwcm90b2NvbDtcbiAgICAgICAgdGhpcy5fZG9tYWluID0gZG9tYWluO1xuICAgICAgICB0aGlzLl9zZXNzaW9uSWQgPSBzZXNzaW9uSWQ7XG4gICAgICAgIHRoaXMuX3ZpZGVvID0gdmlkZW87XG5cbiAgICAgICAgdGhpcy5fcGluZ1NlcnZlciA9IHNlc3Npb25JZCAhPSBudWxsICYmIHNlc3Npb25JZCAhPSBcIlwiO1xuICAgICAgICB0aGlzLl9uZXh0VGltZSA9IHVuZGVmaW5lZDtcblxuICAgICAgICB0aGlzLl9zZW50U3RhcnRQaW5nID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX3NlZWtpbmcgPSBmYWxzZTtcblxuICAgICAgICB0aGlzLl9jdXJyZW50VGltZSA9IDAuMDtcbiAgICAgICAgdGhpcy5fc2Vla0Zyb21UaW1lID0gMC4wO1xuXG4gICAgICAgIHRoaXMuX3ZpZGVvID0gdmlkZW87XG5cbiAgICAgICAgdGhpcy5fb25QbGF5ZXJQb3NpdGlvbkNoYW5nZWQgPSB0aGlzLl9vblBsYXllclBvc2l0aW9uQ2hhbmdlZC5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLl9vblN0YXJ0ID0gdGhpcy5fb25TdGFydC5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLl9vblNlZWtlZCA9IHRoaXMuX29uU2Vla2VkLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuX29uU2Vla2luZyA9IHRoaXMuX29uU2Vla2luZy5iaW5kKHRoaXMpO1xuXG4gICAgICAgIGlmICh0aGlzLl9waW5nU2VydmVyKSB7XG4gICAgICAgICAgICB0aGlzLl92aWRlby5hZGRFdmVudExpc3RlbmVyKCd0aW1ldXBkYXRlJywgdGhpcy5fb25QbGF5ZXJQb3NpdGlvbkNoYW5nZWQpO1xuICAgICAgICAgICAgdGhpcy5fdmlkZW8uYWRkRXZlbnRMaXN0ZW5lcigncGxheWluZycsIHRoaXMuX29uU3RhcnQpO1xuICAgICAgICAgICAgdGhpcy5fdmlkZW8uYWRkRXZlbnRMaXN0ZW5lcignc2Vla2VkJywgdGhpcy5fb25TZWVrZWQpO1xuICAgICAgICAgICAgdGhpcy5fdmlkZW8uYWRkRXZlbnRMaXN0ZW5lcignc2Vla2luZycsIHRoaXMuX29uU2Vla2luZyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIF9jcmVhdGVRdWVyeVN0cmluZyhldmVudDogc3RyaW5nLCBjdXJyZW50UG9zaXRpb246IG51bWJlciwgZnJvbVBvc2l0aW9uPzogbnVtYmVyKSB7XG4gICAgICAgIGNvbnN0IFZFUlNJT04gPSAzO1xuXG4gICAgICAgIGlmIChldmVudCkge1xuICAgICAgICAgICAgbGV0IHN0ciA9IGB2PSR7VkVSU0lPTn0mZXY9JHtldmVudH0mcHQ9JHtjdXJyZW50UG9zaXRpb259YDtcblxuICAgICAgICAgICAgaWYgKGZyb21Qb3NpdGlvbikge1xuICAgICAgICAgICAgICAgIHN0ciArPSBgJmZ0PSR7ZnJvbVBvc2l0aW9ufWA7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBzdHI7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gYHY9JHtWRVJTSU9OfSZwdD0ke2N1cnJlbnRQb3NpdGlvbn1gO1xuICAgIH1cblxuICAgIHByaXZhdGUgX29uU3RhcnQoKSB7XG4gICAgICAgIGlmICh0aGlzLl9waW5nU2VydmVyICYmICF0aGlzLl9zZW50U3RhcnRQaW5nKSB7XG4gICAgICAgICAgICB0aGlzLl9zZW5kUGluZyh0aGlzLlNUQVJULCAwKTtcbiAgICAgICAgICAgIHRoaXMuX3NlbnRTdGFydFBpbmcgPSB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25TZWVraW5nKCkge1xuICAgICAgICB0aGlzLl9zZWVraW5nID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5fbmV4dFRpbWUgPSB1bmRlZmluZWQ7XG4gICAgICAgIHRoaXMuX3NlZWtGcm9tVGltZSA9IHRoaXMuX2N1cnJlbnRUaW1lO1xuICAgIH1cblxuICAgIHByaXZhdGUgX29uU2Vla2VkKCkge1xuICAgICAgICBpZiAodGhpcy5fcGluZ1NlcnZlciAmJiB0aGlzLl9zZWVraW5nICYmIHRoaXMuX3NlZWtGcm9tVGltZSkge1xuICAgICAgICAgICAgdGhpcy5fc2VuZFBpbmcodGhpcy5TRUVLLCB0aGlzLl9jdXJyZW50VGltZSwgdGhpcy5fc2Vla0Zyb21UaW1lKTtcbiAgICAgICAgICAgIHRoaXMuX3NlZWtpbmcgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMuX3NlZWtGcm9tVGltZSA9IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgX29uUGxheWVyUG9zaXRpb25DaGFuZ2VkKCkge1xuICAgICAgICB0aGlzLl9jdXJyZW50VGltZSA9IHRoaXMuX3ZpZGVvLmN1cnJlbnRUaW1lO1xuXG4gICAgICAgIGlmICh0aGlzLl9waW5nU2VydmVyICYmICF0aGlzLl9zZWVraW5nICYmIHRoaXMuX25leHRUaW1lICYmIHRoaXMuX2N1cnJlbnRUaW1lID4gdGhpcy5fbmV4dFRpbWUpIHtcbiAgICAgICAgICAgIHRoaXMuX25leHRUaW1lID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgdGhpcy5fc2VuZFBpbmcobnVsbCwgdGhpcy5fY3VycmVudFRpbWUpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfc2VuZFBpbmcoZXZlbnQ6IHN0cmluZywgY3VycmVudFBvc2l0aW9uOiBudW1iZXIsIGZyb21Qb3NpdGlvbj86IG51bWJlcikge1xuICAgICAgICBsZXQgdXJsID0gYCR7dGhpcy5fcHJvdG9jb2x9Ly8ke3RoaXMuX2RvbWFpbn0vc2Vzc2lvbi9waW5nLyR7dGhpcy5fc2Vzc2lvbklkfS5qc29uPyR7dGhpcy5fY3JlYXRlUXVlcnlTdHJpbmcoZXZlbnQsIGN1cnJlbnRQb3NpdGlvbiwgZnJvbVBvc2l0aW9uKX1gO1xuXG4gICAgICAgIHZhciB4aHIgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcbiAgICAgICAgeGhyLm9wZW4oXCJHRVRcIiwgdXJsLCB0cnVlKTtcbiAgICAgICAgeGhyLnJlc3BvbnNlVHlwZSA9IFwidGV4dFwiO1xuXG4gICAgICAgIHhoci5vbmxvYWQgPSAoKSA9PiB7XG4gICAgICAgICAgICBpZiAoeGhyLnN0YXR1cyA9PT0gMjAwKSB7XG4gICAgICAgICAgICAgICAgbGV0IGpzb24gPSBKU09OLnBhcnNlKHhoci5yZXNwb25zZVRleHQpO1xuICAgICAgICAgICAgICAgIHRoaXMuX25leHRUaW1lID0ganNvbi5uZXh0X3RpbWU7XG5cbiAgICAgICAgICAgICAgICAvL2Fic2VuY2Ugb2YgZXJyb3IgcHJvcGVydHkgaW5kaWNhdGVzIG5vIGVycm9yXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuX25leHRUaW1lIDwgMCB8fCBqc29uLmhhc093blByb3BlcnR5KCdlcnJvcicpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3BpbmdTZXJ2ZXIgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fbmV4dFRpbWUgPSB1bmRlZmluZWQ7XG5cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fdmlkZW8ucmVtb3ZlRXZlbnRMaXN0ZW5lcigndGltZXVwZGF0ZScsIHRoaXMuX29uUGxheWVyUG9zaXRpb25DaGFuZ2VkKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fdmlkZW8ucmVtb3ZlRXZlbnRMaXN0ZW5lcigncGxheWluZycsIHRoaXMuX29uU3RhcnQpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl92aWRlby5yZW1vdmVFdmVudExpc3RlbmVyKCdzZWVrZWQnLCB0aGlzLl9vblNlZWtlZCk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3ZpZGVvLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3NlZWtpbmcnLCB0aGlzLl9vblNlZWtpbmcpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICB4aHIuc2VuZCgpO1xuICAgIH1cbn0iXX0=
