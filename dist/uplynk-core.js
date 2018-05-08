(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
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
        this._licenseManager = new license_manager_1.LicenseManager(this._video, this._adaptiveSource);
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
        if (this._assetInfoService && this._segmentMap) {
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
            return '02.00.18050400';
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
var KeyRequestData = (function () {
    function KeyRequestData() {
    }
    return KeyRequestData;
}());
var LicenseManager = (function () {
    function LicenseManager(video, adaptiveSource) {
        this.LICENSE_TYPE_WIDEVINE = 'edef8ba9-79d6-4ace-a3c8-27dcd51d21ed';
        this.LICENSE_TYPE_PLAYREADY = '9a04f079-9840-4286-ab92-e65be0885f95';
        this._licenseType = '';
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
        this._mediaKeysError = null;
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
        if (!navigator.requestMediaKeySystemAccess) {
            return;
        }
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
                self._mediaKeysError = '[LicenseManager] Your browser/system does not support the requested configurations for playing protected content.';
            });
        })
            .catch(function (err) {
            self._mediaKeysError = '[LicenseManager] Your browser/system does not support the requested configurations for playing protected content.';
        });
    };
    LicenseManager.prototype.onMediaKeyAcquired = function (self, createdMediaKeys) {
        self._mediaKeys = createdMediaKeys;
        self._video.setMediaKeys(self._mediaKeys);
        self.processPendingKeys(self);
    };
    LicenseManager.prototype.processPendingKeys = function (self) {
        if (self._mediaKeys === null && self._mediaKeysError === null) {
            return;
        }
        else if (self._mediaKeys === null && self._mediaKeysError !== null) {
            self._adaptiveSource.signalDrmError(self._mediaKeysError);
            return;
        }
        while (self._pendingKeyRequests.length > 0) {
            var drmItem = self._pendingKeyRequests.shift();
            this._keyRequests.push(drmItem);
            console.log('[LicenseManager] starting license update for DRM playback');
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
        var keySession = self._mediaKeys.createSession('temporary');
        keySession.addEventListener('message', function (event) {
            self.downloadNewKey(self.getLicenseUrl(), event.message, function (data) {
                var prom = event.target.update(data);
                prom.catch(function (e) {
                    self._adaptiveSource.signalDrmError('[LicenseManager] call to MediaKeySession.update() failed: ' + e);
                });
                console.log('[LicenseManager] finished license update for DRM playback');
            });
        }, false);
        var reqPromise = keySession.generateRequest('cenc', initData);
        reqPromise.catch(function (e) {
            self._adaptiveSource.signalDrmError('[LicenseManager] keySession.generateRequest() failed: ' + e);
        });
    };
    LicenseManager.prototype.getLicenseUrl = function () {
        if (this._licenseType === this.LICENSE_TYPE_PLAYREADY) {
            return this._keyServerPrefix + '/pr';
        }
        else if (this._licenseType === this.LICENSE_TYPE_WIDEVINE) {
            return this._keyServerPrefix + '/wv';
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
                    self._adaptiveSource.signalDrmError('[LicenseManager] XHR failed (' + url + '). Status: ' + xhr.status + ' (' + xhr.statusText + ')');
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
        if (this._video.audioTracks) {
            this._video.audioTracks.addEventListener('addtrack', this._onAudioTrackAdded.bind(this));
        }
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
            return '02.00.18050400';
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
    if (assetInfoService && segments) {
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
        if (!segmentMap) {
            return;
        }
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvdHMvYWQvYWQtYnJlYWsudHMiLCJzcmMvdHMvYWRhcHRpdmUtcGxheWVyLnRzIiwic3JjL3RzL2V2ZW50cy50cyIsInNyYy90cy9pZDMvaWQzLWRlY29kZXIudHMiLCJzcmMvdHMvaWQzL2lkMy1oYW5kbGVyLnRzIiwic3JjL3RzL2xpY2Vuc2UtbWFuYWdlci1mcC50cyIsInNyYy90cy9saWNlbnNlLW1hbmFnZXIudHMiLCJzcmMvdHMvbmF0aXZlLXBsYXllci50cyIsInNyYy90cy9wb2x5ZmlsbC9hcnJheS50cyIsInNyYy90cy9wb2x5ZmlsbC9vYmplY3QudHMiLCJzcmMvdHMvcG9seWZpbGwvdnR0LWN1ZS50cyIsInNyYy90cy91cGx5bmstY29yZS50cyIsInNyYy90cy91dGlscy9vYnNlcnZhYmxlLnRzIiwic3JjL3RzL3V0aWxzL3NlZ21lbnQtbWFwLnRzIiwic3JjL3RzL3V0aWxzL3N0cmluZy1tYXAudHMiLCJzcmMvdHMvdXRpbHMvdGh1bWJuYWlsLWhlbHBlci50cyIsInNyYy90cy91dGlscy91dGlscy50cyIsInNyYy90cy93ZWItc2VydmljZXMvYXNzZXQtaW5mby1zZXJ2aWNlLnRzIiwic3JjL3RzL3dlYi1zZXJ2aWNlcy9waW5nLXNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztBQ0FBO0lBT0ksaUJBQVksUUFBbUI7UUFDM0IsSUFBSSxRQUFRLElBQUksUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7WUFDakMsSUFBSSxDQUFDLFNBQVMsR0FBRyxRQUFRLENBQUM7WUFDMUIsSUFBSSxDQUFDLE1BQU0sR0FBRyxRQUFRLENBQUMsTUFBTSxDQUFDO1lBQzlCLElBQUksQ0FBQyxTQUFTLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztZQUN2QyxJQUFJLENBQUMsT0FBTyxHQUFHLFFBQVEsQ0FBQyxRQUFR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QUUsSUFBSSxDQUFDLENBQUM7UUFDM0IsR0FBRyxDQUFDLFlBQVksR0FBRyxNQUFNLENBQUM7UUFFMUIsR0FBRyxDQUFDLE1BQU0sR0FBRztZQUNULElBQUksR0FBRyxDQUFDLE1BQU0sS0FBSyxHQUFHLEVBQUU7Z0JBQ3BCLElBQUksSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxDQUFDO2dCQUN4QyxLQUFJLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUM7Z0JBR2hDLElBQUksS0FBSSxDQUFDLFNBQVMsR0FBRyxDQUFDLElBQUksSUFBSSxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsRUFBRTtvQkFDcEQsS0FBSSxDQUFDLFdBQVcsR0FBRyxLQUFLLENBQUM7b0JBQ3pCLEtBQUksQ0FBQyxTQUFTLEdBQUcsU0FBUyxDQUFDO29CQUUzQixLQUFJLENBQUMsTUFBTSxDQUFDLG1CQUFtQixDQUFDLFlBQVksRUFBRSxLQUFJLENBQUMsd0JBQXdCLENBQUMsQ0FBQztvQkFDN0UsS0FBSSxDQUFDLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxTQUFTLEVBQUUsS0FBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO29CQUMxRCxLQUFJLENBQUMsTUFBTSxDQUFDLG1CQUFtQixDQUFDLFFBQVEsRUFBRSxLQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7b0JBQzFELEtBQUksQ0FBQyxNQUFNLENBQUMsbUJBQW1CLENBQUMsU0FBUyxFQUFFLEtBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztpQkFDL0Q7YUFDSjtRQUNMLENBQUMsQ0FBQztRQUVGLEdBQUcsQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUNmLENBQUM7SUFDTCxrQkFBQztBQUFELENBekhBLEFBeUhDLElBQUE7QUF6SFksa0NBQVciLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbigpe2Z1bmN0aW9uIHIoZSxuLHQpe2Z1bmN0aW9uIG8oaSxmKXtpZighbltpXSl7aWYoIWVbaV0pe3ZhciBjPVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmU7aWYoIWYmJmMpcmV0dXJuIGMoaSwhMCk7aWYodSlyZXR1cm4gdShpLCEwKTt2YXIgYT1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK2krXCInXCIpO3Rocm93IGEuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixhfXZhciBwPW5baV09e2V4cG9ydHM6e319O2VbaV1bMF0uY2FsbChwLmV4cG9ydHMsZnVuY3Rpb24ocil7dmFyIG49ZVtpXVsxXVtyXTtyZXR1cm4gbyhufHxyKX0scCxwLmV4cG9ydHMscixlLG4sdCl9cmV0dXJuIG5baV0uZXhwb3J0c31mb3IodmFyIHU9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZSxpPTA7aTx0Lmxlbmd0aDtpKyspbyh0W2ldKTtyZXR1cm4gb31yZXR1cm4gcn0pKCkiLCJleHBvcnQgY2xhc3MgQWRCcmVhayB7XG4gICAgcmVhZG9ubHkgc3RhcnRUaW1lOiBudW1iZXI7XG4gICAgcmVhZG9ubHkgZW5kVGltZTogbnVtYmVyO1xuICAgIHJlYWRvbmx5IGR1cmF0aW9uOiBudW1iZXI7XG4gICAgcmVhZG9ubHkgbnVtQWRzOiBudW1iZXI7XG4gICAgcHJpdmF0ZSBfc2VnbWVudHM6IFNlZ21lbnRbXTtcblxuICAgIGNvbnN0cnVjdG9yKHNlZ21lbnRzOiBTZWdtZW50W10pIHtcbiAgICAgICAgaWYgKHNlZ21lbnRzICYmIHNlZ21lbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIHRoaXMuX3NlZ21lbnRzID0gc2VnbWVudHM7XG4gICAgICAgICAgICB0aGlzLm51bUFkcyA9IHNlZ21lbnRzLmxlbmd0aDtcbiAgICAgICAgICAgIHRoaXMuc3RhcnRUaW1lID0gc2VnbWVudHNbMF0uc3RhcnRUaW1lO1xuICAgICAgICAgICAgdGhpcy5lbmRUaW1lID0gc2VnbWVudHNbc2VnbWVudHMubGVuZ3RoIC0gMV0uZW5kVGltZTtcbiAgICAgICAgICAgIHRoaXMuZHVyYXRpb24gPSB0aGlzLmVuZFRpbWUgLSB0aGlzLnN0YXJ0VGltZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldEFkUG9zaXRpb25BdCh0aW1lOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX3NlZ21lbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5fc2VnbWVudHNbaV0uc3RhcnRUaW1lIDw9IHRpbWUgJiYgdGltZSA8PSB0aGlzLl9zZWdtZW50c1tpXS5lbmRUaW1lKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGkgKyAxO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIDA7XG4gICAgfVxuXG4gICAgZ2V0U2VnbWVudEF0KGluZGV4OiBudW1iZXIpOiBTZWdtZW50IHtcbiAgICAgICAgaWYodGhpcy5fc2VnbWVudHMgJiYgaW5kZXggPiAtMSAmJiBpbmRleCA8IHRoaXMuX3NlZ21lbnRzLmxlbmd0aCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3NlZ21lbnRzW2luZGV4XTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgY29udGFpbnModGltZTogbnVtYmVyKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLnN0YXJ0VGltZSA8PSB0aW1lICYmIHRpbWUgPD0gdGhpcy5lbmRUaW1lO1xuICAgIH1cbn0iLCJpbXBvcnQgeyBPYnNlcnZhYmxlIH0gZnJvbSAnLi91dGlscy9vYnNlcnZhYmxlJztcbmltcG9ydCB7IEFzc2V0SW5mbywgQXNzZXRJbmZvU2VydmljZSB9IGZyb20gJy4vd2ViLXNlcnZpY2VzL2Fzc2V0LWluZm8tc2VydmljZSc7XG5pbXBvcnQgeyBQaW5nU2VydmljZSB9IGZyb20gJy4vd2ViLXNlcnZpY2VzL3Bpbmctc2VydmljZSc7XG5pbXBvcnQgeyBJRDNIYW5kbGVyLCBJRDNUYWdFdmVudCwgVHh4eElEM0ZyYW1lRXZlbnQsIFByaXZJRDNGcmFtZUV2ZW50LCBUZXh0SUQzRnJhbWVFdmVudCwgU2xpY2VFdmVudCB9IGZyb20gJy4vaWQzL2lkMy1oYW5kbGVyJztcbmltcG9ydCB7IElEM0RhdGEgfSBmcm9tICcuL2lkMy9pZDMtZGF0YSc7XG5pbXBvcnQgeyBTZWdtZW50TWFwIH0gZnJvbSAnLi91dGlscy9zZWdtZW50LW1hcCc7XG5pbXBvcnQgKiBhcyB0aHVtYiBmcm9tICcuL3V0aWxzL3RodW1ibmFpbC1oZWxwZXInO1xuaW1wb3J0IHsgQWRCcmVhayB9IGZyb20gJy4vYWQvYWQtYnJlYWsnO1xuaW1wb3J0IHsgRXZlbnRzIH0gZnJvbSAnLi9ldmVudHMnO1xuaW1wb3J0IHsgUGxheWVyLCBSZXNvbHV0aW9uLCBNaW1lVHlwZSB9IGZyb20gJy4vcGxheWVyJztcbmltcG9ydCB7IGlzTG9jYWxTdG9yYWdlQXZhaWxhYmxlIH0gZnJvbSAnLi91dGlscy91dGlscyc7XG5pbXBvcnQgeyBMaWNlbnNlTWFuYWdlciB9IGZyb20gJy4vbGljZW5zZS1tYW5hZ2VyJztcbmltcG9ydCB7IGJhc2U2NFRvQnVmZmVyLCBnZXRQcm90b2NvbCwgaXNJRTExT3JFZGdlIH0gZnJvbSAnLi91dGlscy91dGlscyc7XG5cbmV4cG9ydCBjbGFzcyBBZGFwdGl2ZVBsYXllciBleHRlbmRzIE9ic2VydmFibGUgaW1wbGVtZW50cyBQbGF5ZXIge1xuICAgIHByaXZhdGUgX3ZpZGVvOiBIVE1MVmlkZW9FbGVtZW50O1xuICAgIHByaXZhdGUgX2FkYXB0aXZlU291cmNlOiBNb2R1bGUuQWRhcHRpdmVTb3VyY2U7XG4gICAgcHJpdmF0ZSBfbWVkaWFTb3VyY2U6IE1lZGlhU291cmNlO1xuICAgIHByaXZhdGUgX3VybDogc3RyaW5nO1xuICAgIHByaXZhdGUgX29iamVjdFVybDogc3RyaW5nO1xuICAgIHByaXZhdGUgX2Fzc2V0SW5mb1NlcnZpY2U6IEFzc2V0SW5mb1NlcnZpY2U7XG4gICAgcHJpdmF0ZSBfcGluZ1NlcnZpY2U6IFBpbmdTZXJ2aWNlO1xuICAgIHByaXZhdGUgX2lkM0hhbmRsZXI6IElEM0hhbmRsZXI7XG4gICAgcHJpdmF0ZSBfc2VnbWVudE1hcDogU2VnbWVudE1hcDtcbiAgICBwcml2YXRlIF9jb25maWc6IFBsYXllck9wdGlvbnM7XG4gICAgcHJpdmF0ZSBfZmlyZWRSZWFkeUV2ZW50OiBib29sZWFuO1xuICAgIHByaXZhdGUgX2lzU2FmYXJpOiBib29sZWFuO1xuICAgIHByaXZhdGUgX2lzRmlyZWZveDogYm9vbGVhbjtcbiAgICBwcml2YXRlIF9pc0Nocm9tZTogYm9vbGVhbjtcbiAgICBwcml2YXRlIF9pc0lFOiBib29sZWFuO1xuICAgIHByaXZhdGUgX2lzUGF1c2VkOiBib29sZWFuO1xuICAgIHByaXZhdGUgX3RhcmdldFRpbWU6IG51bWJlcjtcbiAgICBwcml2YXRlIF9mb3JjZWRBZEJyZWFrOiBBZEJyZWFrO1xuICAgIHByaXZhdGUgX3ZpZGVvUmVjdDogQ2xpZW50UmVjdDtcbiAgICBwcml2YXRlIF9lbmRlZDogYm9vbGVhbjtcbiAgICBwcml2YXRlIF91c2luZ0N1c3RvbVVJOiBib29sZWFuO1xuICAgIHByaXZhdGUgX2ludGVydmFsSWQ6IG51bWJlcjtcbiAgICBwcml2YXRlIF9saWNlbnNlTWFuYWdlcjogTGljZW5zZU1hbmFnZXI7XG4gICAgcHJpdmF0ZSBfcHJvdG9jb2w6IHN0cmluZztcblxuICAgIHByaXZhdGUgcmVhZG9ubHkgX2RlZmF1bHRzOiBQbGF5ZXJPcHRpb25zID0ge1xuICAgICAgICBkaXNhYmxlU2Vla0R1cmluZ0FkQnJlYWs6IHRydWUsXG4gICAgICAgIHNob3dQb3N0ZXI6IGZhbHNlLFxuICAgICAgICBkZWJ1ZzogZmFsc2UsXG4gICAgICAgIGxpbWl0UmVzb2x1dGlvblRvVmlld1NpemU6IGZhbHNlLFxuICAgIH07XG5cbiAgICBjb25zdHJ1Y3Rvcih2aWRlbzogSFRNTFZpZGVvRWxlbWVudCwgb3B0aW9ucz86IFBsYXllck9wdGlvbnMpIHtcbiAgICAgICAgc3VwZXIoKTtcblxuICAgICAgICAvL2luaXQgY29uZmlnXG4gICAgICAgIHZhciBkYXRhID0ge307XG5cbiAgICAgICAgLy90cnkgcGFyc2luZyBkYXRhIGF0dHJpYnV0ZSBjb25maWdcbiAgICAgICAgdHJ5IHsgZGF0YSA9IEpTT04ucGFyc2UodmlkZW8uZ2V0QXR0cmlidXRlKCdkYXRhLWNvbmZpZycpKTsgfVxuICAgICAgICBjYXRjaCAoZSkgeyB9XG5cbiAgICAgICAgLy9tZXJnZSBkZWZhdWx0cyB3aXRoIHVzZXIgb3B0aW9uc1xuICAgICAgICB0aGlzLl9jb25maWcgPSBPYmplY3QuYXNzaWduKHt9LCB0aGlzLl9kZWZhdWx0cywgb3B0aW9ucywgZGF0YSk7XG5cbiAgICAgICAgdGhpcy5fdmlkZW8gPSB2aWRlbztcbiAgICAgICAgdGhpcy5faWQzSGFuZGxlciA9IG5ldyBJRDNIYW5kbGVyKHZpZGVvKTtcbiAgICAgICAgdGhpcy5faWQzSGFuZGxlci5vbihJRDNIYW5kbGVyLkV2ZW50LklEM1RhZywgdGhpcy5fb25JRDNUYWcuYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuX2lkM0hhbmRsZXIub24oSUQzSGFuZGxlci5FdmVudC5UeHh4SUQzRnJhbWUsIHRoaXMuX29uVHh4eElEM0ZyYW1lLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLl9pZDNIYW5kbGVyLm9uKElEM0hhbmRsZXIuRXZlbnQuUHJpdklEM0ZyYW1lLCB0aGlzLl9vblByaXZJRDNGcmFtZS5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5faWQzSGFuZGxlci5vbihJRDNIYW5kbGVyLkV2ZW50LlRleHRJRDNGcmFtZSwgdGhpcy5fb25UZXh0SUQzRnJhbWUuYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuX2lkM0hhbmRsZXIub24oSUQzSGFuZGxlci5FdmVudC5TbGljZUVudGVyZWQsIHRoaXMuX29uU2xpY2VFbnRlcmVkLmJpbmQodGhpcykpO1xuXG4gICAgICAgIHRoaXMuX29uVmlkZW9UaW1lVXBkYXRlID0gdGhpcy5fb25WaWRlb1RpbWVVcGRhdGUuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5fb25WaWRlb1NlZWtpbmcgPSB0aGlzLl9vblZpZGVvU2Vla2luZy5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLl9vblZpZGVvU2Vla2VkID0gdGhpcy5fb25WaWRlb1NlZWtlZC5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLl9vbk1lZGlhU291cmNlT3BlbiA9IHRoaXMuX29uTWVkaWFTb3VyY2VPcGVuLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuX29uVmlkZW9QbGF5YmFja0VuZCA9IHRoaXMuX29uVmlkZW9QbGF5YmFja0VuZC5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLl9vblRpbWVyVGljayA9IHRoaXMuX29uVGltZXJUaWNrLmJpbmQodGhpcyk7XG5cbiAgICAgICAgdGhpcy5faXNTYWZhcmkgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5faXNJRSA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9pc0ZpcmVmb3ggPSBmYWxzZTtcbiAgICAgICAgdGhpcy5faXNDaHJvbWUgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fZmlyZWRSZWFkeUV2ZW50ID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2VuZGVkID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX3VzaW5nQ3VzdG9tVUkgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5faW50ZXJ2YWxJZCA9IDA7XG4gICAgICAgIHRoaXMuX2xpY2Vuc2VNYW5hZ2VyID0gbnVsbDtcblxuICAgICAgICB0aGlzLl9vdmVycmlkZUN1cnJlbnRUaW1lKCk7XG4gICAgICAgIHRoaXMuX292ZXJyaWRlRW5kZWQoKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vdmVycmlkZUN1cnJlbnRUaW1lKCk6IHZvaWQge1xuICAgICAgICAvL292ZXJyaWRlICdjdXJyZW50VGltZScgcHJvcGVydHkgc28gd2UgY2FuIHByZXZlbnQgdXNlcnMgZnJvbSBzZXR0aW5nIHZpZGVvLmN1cnJlbnRUaW1lLCBhbGxvd2luZyB0aGVtXG4gICAgICAgIC8vIHRvIHNraXAgYWRzLlxuICAgICAgICB2YXIgY3VycmVudFRpbWVQcm9wZXJ0eSA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IoSFRNTE1lZGlhRWxlbWVudC5wcm90b3R5cGUsICdjdXJyZW50VGltZScpO1xuICAgICAgICBpZiAoY3VycmVudFRpbWVQcm9wZXJ0eSkge1xuXG4gICAgICAgICAgICB2YXIgZ2V0Q3VycmVudFRpbWUgPSBjdXJyZW50VGltZVByb3BlcnR5LmdldDtcbiAgICAgICAgICAgIHZhciBzZXRDdXJyZW50VGltZSA9IGN1cnJlbnRUaW1lUHJvcGVydHkuc2V0O1xuXG4gICAgICAgICAgICBsZXQgc2VsZiA9IHRoaXM7XG5cbiAgICAgICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0aGlzLl92aWRlbywgJ2N1cnJlbnRUaW1lJywge1xuICAgICAgICAgICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZ2V0Q3VycmVudFRpbWUuYXBwbHkodGhpcyk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBzZXQ6IGZ1bmN0aW9uICh2YWw6IG51bWJlcikge1xuICAgICAgICAgICAgICAgICAgICBpZiAoc2VsZi5jYW5TZWVrKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYuX2VuZGVkID0gZmFsc2U7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IHBhcnNlRmxvYXQoPGFueT52YWwpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgYWN0dWFsVGltZSA9IHNlbGYuZ2V0U2Vla1RpbWUodmFsKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNldEN1cnJlbnRUaW1lLmFwcGx5KHRoaXMsIFthY3R1YWxUaW1lXSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vY2FsbCBzZWVrIHJpZ2h0IGF3YXkgaW5zdGVhZCBvZiB3YWl0aW5nIGZvciAnc2Vla2luZycgZXZlbnRcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHNvIHBsYXllciBkb2Vzbid0IGhhdmUgdGltZSB0byBkb3duc2hpZnQgdGhpbmtpbmcgaXQgaGFzXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBubyBkYXRhIGF0IHRoZSBjdXJyZW50VGltZSBwb3NpdGlvbiAoVVAtNjAxMCkuXG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxmLl9hZGFwdGl2ZVNvdXJjZS5zZWVrKGFjdHVhbFRpbWUpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBlbnVtZXJhYmxlOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBjb25maWd1cmFibGU6IGZhbHNlLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIF9vdmVycmlkZUVuZGVkKCk6IHZvaWQge1xuICAgICAgICAvL292ZXJyaWRlIGVuZGVkIHByb3BlcnR5IHNvIHdlIGNhbiBtYWtlIGl0IG5vdCByZWFkLW9ubHkuIGFsbG93aW5nIHVzIHRvIGZpcmUgdGhlICdlbmRlZCdcbiAgICAgICAgLy8gZXZlbnQgYW5kIGhhdmUgdGhlIHVpIHJlc3BvbmQgY29ycmVjdGx5XG4gICAgICAgIGxldCBzZWxmID0gdGhpcztcblxuICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkodGhpcy5fdmlkZW8sICdlbmRlZCcsIHtcbiAgICAgICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBzZWxmLl9lbmRlZDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBlbnVtZXJhYmxlOiBmYWxzZSxcbiAgICAgICAgICAgIGNvbmZpZ3VyYWJsZTogZmFsc2UsXG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHN0YXRpYyBnZXQgRXZlbnQoKSB7XG4gICAgICAgIHJldHVybiBFdmVudHM7XG4gICAgfVxuXG4gICAgZGVzdHJveSgpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5fc3RvcE1haW5Mb29wKCk7XG5cbiAgICAgICAgaWYgKHR5cGVvZiB0aGlzLl9hZGFwdGl2ZVNvdXJjZSAhPSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2UuZGVsZXRlKCk7XG4gICAgICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZSA9IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLl9vYmplY3RVcmwpIHtcbiAgICAgICAgICAgIHdpbmRvdy5VUkwucmV2b2tlT2JqZWN0VVJMKHRoaXMuX29iamVjdFVybCk7XG4gICAgICAgICAgICB0aGlzLl9vYmplY3RVcmwgPSBudWxsO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgbG9hZChpbmZvOiBzdHJpbmcgfCBMb2FkQ29uZmlnKTogdm9pZCB7XG4gICAgICAgIGxldCB1cmw6IHN0cmluZztcbiAgICAgICAgaWYgKHR5cGVvZiBpbmZvID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICB1cmwgPSBpbmZvIGFzIHN0cmluZztcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHVybCA9IChpbmZvIGFzIExvYWRDb25maWcpLnVybDtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX3Byb3RvY29sID0gZ2V0UHJvdG9jb2wodXJsKTtcbiAgICAgICAgLy9JRTExIGFuZCBFZGdlIGRvbid0IHJlZGlyZWN0ICdodHRwOicgdG8gJ2h0dHBzOicgYWZ0ZXIgSFNUUyBoZWFkZXJzIGFyZSByZXR1cm5lZFxuICAgICAgICAvLyBmcm9tIHRoZSBmaXJzdCAnaHR0cHM6JyByZXF1ZXN0LiAgSW5zdGVhZCwgYSA1MDAgZXJyb3IgaXMgcmV0dXJuZWQuICBTbyBqdXN0IGZvcmNlXG4gICAgICAgIC8vICdodHRwczonIGZyb20gdGhlIGdldCBnbyBhbmQgd2UgY2FuIGF2b2lkIHRob3NlIGlzc3Vlcy5cbiAgICAgICAgaWYgKGlzSUUxMU9yRWRnZSgpICYmIHRoaXMuX3Byb3RvY29sID09PSAnaHR0cDonICYmIHRoaXMuX2lzVXBseW5rVXJsKHVybCkpIHtcbiAgICAgICAgICAgIHRoaXMuX3Byb3RvY29sID0gJ2h0dHBzOic7XG4gICAgICAgICAgICB1cmwgPSAnaHR0cHM6JyArIHVybC5zdWJzdHIoNSk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9maXJlZFJlYWR5RXZlbnQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fdXJsID0gdXJsO1xuICAgICAgICB0aGlzLl90YXJnZXRUaW1lID0gdW5kZWZpbmVkO1xuICAgICAgICB0aGlzLl9mb3JjZWRBZEJyZWFrID0gdW5kZWZpbmVkO1xuICAgICAgICB0aGlzLl9lbmRlZCA9IGZhbHNlO1xuXG4gICAgICAgIHRoaXMuX21lZGlhU291cmNlID0gbmV3IE1lZGlhU291cmNlKCk7XG4gICAgICAgIGlmICh0eXBlb2YgdGhpcy5fYWRhcHRpdmVTb3VyY2UgIT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlLmRlbGV0ZSgpO1xuICAgICAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2UgPSB1bmRlZmluZWQ7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl92aWRlby5yZW1vdmVFdmVudExpc3RlbmVyKCd0aW1ldXBkYXRlJywgdGhpcy5fb25WaWRlb1RpbWVVcGRhdGUpO1xuICAgICAgICB0aGlzLl92aWRlby5yZW1vdmVFdmVudExpc3RlbmVyKCdzZWVraW5nJywgdGhpcy5fb25WaWRlb1NlZWtpbmcpO1xuICAgICAgICB0aGlzLl92aWRlby5yZW1vdmVFdmVudExpc3RlbmVyKCdzZWVrZWQnLCB0aGlzLl9vblZpZGVvU2Vla2VkKTtcbiAgICAgICAgdGhpcy5fdmlkZW8ucmVtb3ZlRXZlbnRMaXN0ZW5lcignZW5kZWQnLCB0aGlzLl9vblZpZGVvUGxheWJhY2tFbmQpO1xuXG4gICAgICAgIHRoaXMuX3ZpZGVvLmFkZEV2ZW50TGlzdGVuZXIoJ3RpbWV1cGRhdGUnLCB0aGlzLl9vblZpZGVvVGltZVVwZGF0ZSk7XG4gICAgICAgIHRoaXMuX3ZpZGVvLmFkZEV2ZW50TGlzdGVuZXIoJ3NlZWtpbmcnLCB0aGlzLl9vblZpZGVvU2Vla2luZyk7XG4gICAgICAgIHRoaXMuX3ZpZGVvLmFkZEV2ZW50TGlzdGVuZXIoJ3NlZWtlZCcsIHRoaXMuX29uVmlkZW9TZWVrZWQpO1xuICAgICAgICB0aGlzLl92aWRlby5hZGRFdmVudExpc3RlbmVyKCdlbmRlZCcsIHRoaXMuX29uVmlkZW9QbGF5YmFja0VuZCk7XG4gICAgICAgIC8vIHZpZGVvLm9ubG9hZGVkbWV0YWRhdGEgaXMgdGhlIGZpcnN0IHRpbWUgdGhlIHZpZGVvIHdpZHRoL2hlaWdodCBpcyBhdmFpbGFibGVcbiAgICAgICAgdGhpcy5fdmlkZW8ub25sb2FkZWRtZXRhZGF0YSA9IHRoaXMudXBkYXRlVmlkZW9SZWN0LmJpbmQodGhpcyk7XG5cbiAgICAgICAgdGhpcy5fbWVkaWFTb3VyY2UuYWRkRXZlbnRMaXN0ZW5lcignc291cmNlb3BlbicsIHRoaXMuX29uTWVkaWFTb3VyY2VPcGVuKTtcblxuICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZSA9IG5ldyBNb2R1bGUuQWRhcHRpdmVTb3VyY2UoKTtcbiAgICAgICAgdGhpcy5fbGljZW5zZU1hbmFnZXIgPSBuZXcgTGljZW5zZU1hbmFnZXIodGhpcy5fdmlkZW8sdGhpcy5fYWRhcHRpdmVTb3VyY2UpO1xuXG4gICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlLm9uQmVhbUxvYWRlZCh0aGlzLl9vbkJlYW1Mb2FkZWQuYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlLm9uVHJhY2tMb2FkZWQodGhpcy5fb25UcmFja0xvYWRlZC5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2Uub25Mb2FkZWQodGhpcy5fb25Tb3VyY2VMb2FkZWQuYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlLm9uTG9hZEVycm9yKHRoaXMuX29uTG9hZEVycm9yLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5vbkRybUVycm9yKHRoaXMuX29uRHJtRXJyb3IuYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlLm9uU2VnbWVudE1hcENoYW5nZWQodGhpcy5fb25TZWdtZW50TWFwQ2hhbmdlZC5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2Uuc3RhcnRNYWluTG9vcCh0aGlzLl9zdGFydE1haW5Mb29wLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5zdG9wTWFpbkxvb3AodGhpcy5fc3RvcE1haW5Mb29wLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5zdGFydExpY2Vuc2VSZXF1ZXN0KHRoaXMuX3N0YXJ0TGljZW5zZVJlcXVlc3QuYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlLm9uQXVkaW9UcmFja1N3aXRjaGVkKHRoaXMuX29uQXVkaW9UcmFja1N3aXRjaGVkLmJpbmQodGhpcykpO1xuXG5cbiAgICAgICAgaWYgKGlzTG9jYWxTdG9yYWdlQXZhaWxhYmxlKCkpIHtcbiAgICAgICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlLnNldExvYWRBbmRTYXZlQmFuZHdpZHRoKHRoaXMuX2xvYWRCYW5kd2lkdGhIaXN0b3J5LmJpbmQodGhpcyksIHRoaXMuX3NhdmVCYW5kd2lkdGhIaXN0b3J5LmJpbmQodGhpcykpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuX29iamVjdFVybCkge1xuICAgICAgICAgICAgd2luZG93LlVSTC5yZXZva2VPYmplY3RVUkwodGhpcy5fb2JqZWN0VXJsKTtcbiAgICAgICAgICAgIHRoaXMuX29iamVjdFVybCA9IG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9vYmplY3RVcmwgPSB3aW5kb3cuVVJMLmNyZWF0ZU9iamVjdFVSTCh0aGlzLl9tZWRpYVNvdXJjZSk7XG4gICAgICAgIHRoaXMuX3ZpZGVvLnNyYyA9IHRoaXMuX29iamVjdFVybDtcbiAgICAgICAgdGhpcy5fdmlkZW8ubG9hZCgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIERldGVybWluZXMgaWYgdGhlIHBsYXllciBjYW4gc2VlayBnaXZlbiBpdCdzIGN1cnJlbnQgcG9zaXRpb24gYW5kXG4gICAgICogd2hldGhlciBvciBub3QgaXQncyBpbiBhbiBhZCBicmVhay5cbiAgICAgKiBAcmV0dXJuIHtib29sZWFufSBUcnVlIGlmIHRoZSBwbGF5ZXIgY2FuIHNlZWssIG90aGVyd2lzZSBmYWxzZS5cbiAgICAgKi9cbiAgICBjYW5TZWVrKCk6IGJvb2xlYW4ge1xuICAgICAgICBpZiAodGhpcy5fYWRhcHRpdmVTb3VyY2UgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMucGxheWxpc3RUeXBlID09PSAnTElWRScgfHwgdGhpcy5wbGF5bGlzdFR5cGUgPT09ICdFVkVOVCcpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgLy9jYW4ndCBwcmV2ZW50IGFsbCBzZWVrcyAodmlhIHVpIG9yIGN1cnJlbnRUaW1lIHByb3BlcnR5KVxuICAgICAgICAvLyB3aXRob3V0IHVzaW5nIGEgY3VzdG9tIHVpIChVUC0zMjY5KS5cbiAgICAgICAgaWYgKCF0aGlzLl91c2luZ0N1c3RvbVVJKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghdGhpcy5fY29uZmlnLmRpc2FibGVTZWVrRHVyaW5nQWRCcmVhaykge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5fc2VnbWVudE1hcCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gIXRoaXMuX3NlZ21lbnRNYXAuaW5BZEJyZWFrKHRoaXMuX3ZpZGVvLmN1cnJlbnRUaW1lKTtcbiAgICB9XG5cbiAgICBnZXRTZWVrVGltZSh0YXJnZXRUaW1lOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICBpZiAodGhpcy5wbGF5bGlzdFR5cGUgPT09ICdMSVZFJyB8fCB0aGlzLnBsYXlsaXN0VHlwZSA9PT0gJ0VWRU5UJykge1xuICAgICAgICAgICAgcmV0dXJuIHRhcmdldFRpbWU7XG4gICAgICAgIH1cblxuICAgICAgICAvL2FsbG93IHVzZXJzIHRvIHNlZWsgYXQgYW55IHRpbWVcbiAgICAgICAgaWYgKCF0aGlzLl9jb25maWcuZGlzYWJsZVNlZWtEdXJpbmdBZEJyZWFrKSB7XG4gICAgICAgICAgICByZXR1cm4gdGFyZ2V0VGltZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghdGhpcy5fdXNpbmdDdXN0b21VSSkge1xuICAgICAgICAgICAgcmV0dXJuIHRhcmdldFRpbWU7XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgY3VycmVudFRpbWUgPSB0aGlzLl92aWRlby5jdXJyZW50VGltZTtcblxuICAgICAgICAvL2FyZSB3ZSBzZWVraW5nIHRvIHRoZSBtaWRkbGUgb2YgYW4gYWQ/XG4gICAgICAgIC8vaWYgc28sIHNlZWsgdG8gYmVnaW5uaW5nIG9mIHRoZSBhZCBhbmQgcGxheSBvbi5cbiAgICAgICAgbGV0IGFkQnJlYWsgPSB0aGlzLl9zZWdtZW50TWFwLmdldEFkQnJlYWsodGFyZ2V0VGltZSk7XG4gICAgICAgIGlmIChhZEJyZWFrKSB7XG4gICAgICAgICAgICByZXR1cm4gYWRCcmVhay5zdGFydFRpbWU7XG4gICAgICAgIH1cblxuICAgICAgICAvL2FyZSB3ZSBza2lwcGluZyBwYXN0IGFueSBhZHMgYnkgc2Vla2luZz9cbiAgICAgICAgbGV0IGFkQnJlYWtzID0gdGhpcy5fc2VnbWVudE1hcC5nZXRBZEJyZWFrc0JldHdlZW4oY3VycmVudFRpbWUsIHRhcmdldFRpbWUpO1xuICAgICAgICBpZiAoYWRCcmVha3MgJiYgYWRCcmVha3MubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgLy9wbGF5IG5lYXJlc3QgYWQgYnJlYWsgdGhlbiBza2lwIHRvIG9yaWdpbmFsIHRhcmdldCB0aW1lXG4gICAgICAgICAgICB0aGlzLl90YXJnZXRUaW1lID0gdGFyZ2V0VGltZTtcbiAgICAgICAgICAgIHRoaXMuX2ZvcmNlZEFkQnJlYWsgPSBhZEJyZWFrc1thZEJyZWFrcy5sZW5ndGggLSAxXTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9mb3JjZWRBZEJyZWFrLnN0YXJ0VGltZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0YXJnZXRUaW1lO1xuICAgIH1cblxuICAgIHB1YmxpYyBzZXRCcm93c2VyKHNhZmFyaTogYm9vbGVhbiwgaWU6IGJvb2xlYW4sIGNocm9tZTogYm9vbGVhbiwgZmlyZWZveDogYm9vbGVhbikge1xuICAgICAgICB0aGlzLl9pc1NhZmFyaSA9IHNhZmFyaTtcbiAgICAgICAgdGhpcy5faXNJRSA9IGllO1xuICAgICAgICB0aGlzLl9pc0ZpcmVmb3ggPSBmaXJlZm94O1xuICAgICAgICB0aGlzLl9pc0Nocm9tZSA9IGNocm9tZTtcbiAgICAgICAgdGhpcy5fdXNpbmdDdXN0b21VSSA9IHRydWU7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25WaWRlb1RpbWVVcGRhdGUoKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLl9hZGFwdGl2ZVNvdXJjZSAmJiB0aGlzLl92aWRlbykge1xuICAgICAgICAgICAgLy9pZiB3ZSBmb3JjZWQgdGhlIHVzZXIgdG8gd2F0Y2ggYW4gYWQgd2hlbiB0aGV5IHRyaWVkIHRvIHNlZWsgcGFzdCBpdCxcbiAgICAgICAgICAgIC8vIHRoaXMgd2lsbCBzZWVrIHRvIHRoZSBkZXNpcmVkIHBvc2l0aW9uIGFmdGVyIHRoZSBhZCBpcyBvdmVyXG4gICAgICAgICAgICBpZiAodGhpcy5fZm9yY2VkQWRCcmVhayAmJiB0aGlzLl92aWRlby5jdXJyZW50VGltZSA+IHRoaXMuX2ZvcmNlZEFkQnJlYWsuZW5kVGltZSkge1xuICAgICAgICAgICAgICAgIGxldCB0YXJnZXRUaW1lID0gdGhpcy5fdGFyZ2V0VGltZTtcbiAgICAgICAgICAgICAgICB0aGlzLl90YXJnZXRUaW1lID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIHRoaXMuX2ZvcmNlZEFkQnJlYWsgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgdGhpcy5fdmlkZW8uY3VycmVudFRpbWUgPSB0YXJnZXRUaW1lO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvL2lmIHRoZSB1c2VyIGNsaWNrcyBvbiB0aGUgdGltZWxpbmUgd2hlbiB1c2luZyB0aGUgYnJvd3NlcidzIG5hdGl2ZSB1aSxcbiAgICAgICAgICAgIC8vIGl0IGNhdXNlcyBhICd0aW1ldXBkYXRlJyBldmVudCBqdXN0IGJlZm9yZSBhICdzZWVrJyBldmVudCwgY2F1c2luZyB0aGVcbiAgICAgICAgICAgIC8vIHVwbHluayBwbGF5ZXIgdG8gc2VsZWN0IHJheSBieSBiYW5kd2lkdGguIHRoZSByZXN1bHQgb2YgdGhhdCBpcyBkb3duc2hpZnRpbmdcbiAgICAgICAgICAgIC8vIHRvIHRoZSBsb3dlc3QgcmF5IHJpZ2h0IGJlZm9yZSB0aGUgc2Vlay4gdGhhdCByYXkgdHlwaWNhbGx5IGlzbid0IGxvYWRlZCB5ZXRcbiAgICAgICAgICAgIC8vIHNvIGFuIGVycm9yIG9jY3VycyBhbmQgdGhlIHNlZWsgZmFpbHMgY2F1c2luZyBwbGF5YmFjayB0byBzdG9wLlxuICAgICAgICAgICAgaWYgKHRoaXMuX2FkYXB0aXZlU291cmNlICYmIHRoaXMuX3ZpZGVvICYmICF0aGlzLl92aWRlby5zZWVraW5nKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2Uub25UaW1lVXBkYXRlKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vYXJlIHdlIGF0IG9yIG5lYXIgdGhlIGVuZCBvZiBhIFZPRCBhc3NldC4gdmlkZW8uY3VycmVudFRpbWUgZG9lc24ndCBhbHdheXMgZXF1YWwgdmlkZW8uZHVyYXRpb24gd2hlbiB0aGUgYnJvd3NlclxuICAgICAgICAgICAgLy8gc3RvcHMgcGxheWJhY2sgYXQgdGhlIGVuZCBvZiBhIFZPRC5cbiAgICAgICAgICAgIGlmICh0aGlzLnBsYXlsaXN0VHlwZSA9PT0gJ1ZPRCcgJiYgIXRoaXMuX2VuZGVkICYmIHRoaXMuX3ZpZGVvLmR1cmF0aW9uIC0gdGhpcy5fdmlkZW8uY3VycmVudFRpbWUgPD0gMC4yNSkge1xuXG4gICAgICAgICAgICAgICAgdGhpcy5fZW5kZWQgPSB0cnVlO1xuXG4gICAgICAgICAgICAgICAgLy9maXJlIHZpZGVvLmVuZGVkIGV2ZW50IG1hbnVhbGx5XG4gICAgICAgICAgICAgICAgdmFyIGV2ZW50ID0gbmV3IEN1c3RvbUV2ZW50KCdlbmRlZCcpO1xuICAgICAgICAgICAgICAgIHRoaXMuX3ZpZGVvLmRpc3BhdGNoRXZlbnQoZXZlbnQpO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5fdmlkZW8ucGF1c2UoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gd2UgY2FuIHJlc3BvbmQgdG8gdmlkZW8gcmVzaXplcyBxdWlja2x5IGJ5IHJ1bm5pbmcgd2l0aGluIF9vblZpZGVvVGltZVVwZGF0ZSgpXG4gICAgICAgICAgICB0aGlzLnVwZGF0ZVZpZGVvUmVjdCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25WaWRlb1NlZWtpbmcoKTogdm9pZCB7XG4gICAgICAgIC8vUGF1c2luZyBkdXJpbmcgc2VlayBzZWVtcyB0byBoZWxwIHNhZmFyaSBvdXQgd2hlbiBzZWVraW5nIGJleW9uZCB0aGVcbiAgICAgICAgLy9lbmQgb2YgaXQncyB2aWRlbyBidWZmZXIsIHBlcmhhcHMgSSB3aWxsIGZpbmQgYW5vdGhlciBzb2x1dGlvbiBhdCBzb21lXG4gICAgICAgIC8vcG9pbnQsIGJ1dCBmb3Igbm93IHRoaXMgaXMgd29ya2luZy5cbiAgICAgICAgaWYgKHRoaXMuX2lzU2FmYXJpICYmICEodGhpcy5wbGF5bGlzdFR5cGUgPT0gXCJFVkVOVFwiIHx8IHRoaXMucGxheWxpc3RUeXBlID09IFwiTElWRVwiKSkge1xuICAgICAgICAgICAgdGhpcy5faXNQYXVzZWQgPSB0aGlzLl92aWRlby5wYXVzZWQ7XG4gICAgICAgICAgICB0aGlzLl92aWRlby5wYXVzZSgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25WaWRlb1NlZWtlZCgpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuX2lzU2FmYXJpICYmICF0aGlzLl9pc1BhdXNlZCAmJiAhKHRoaXMucGxheWxpc3RUeXBlID09IFwiRVZFTlRcIiB8fCB0aGlzLnBsYXlsaXN0VHlwZSA9PSBcIkxJVkVcIikpIHtcbiAgICAgICAgICAgIHRoaXMuX3ZpZGVvLnBsYXkoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgX29uVmlkZW9QbGF5YmFja0VuZCgpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2UudmlkZW9QbGF5YmFja0VuZCgpO1xuICAgIH1cblxuICAgIHByaXZhdGUgX29uTWVkaWFTb3VyY2VPcGVuKCk6IHZvaWQge1xuICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5pbml0aWFsaXplVmlkZW9FbGVtZW50KHRoaXMuX3ZpZGVvLCB0aGlzLl9tZWRpYVNvdXJjZSwgdGhpcy5fY29uZmlnLmRlYnVnKTtcbiAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2UubG9hZCh0aGlzLl91cmwpO1xuICAgIH1cblxuICAgIHByaXZhdGUgX29uSUQzVGFnKGV2ZW50OiBJRDNUYWdFdmVudCk6IHZvaWQge1xuICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5JRDNUYWcsIGV2ZW50KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vblR4eHhJRDNGcmFtZShldmVudDogVHh4eElEM0ZyYW1lRXZlbnQpOiB2b2lkIHtcbiAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuVHh4eElEM0ZyYW1lLCBldmVudCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25Qcml2SUQzRnJhbWUoZXZlbnQ6IFByaXZJRDNGcmFtZUV2ZW50KTogdm9pZCB7XG4gICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLlByaXZJRDNGcmFtZSwgZXZlbnQpO1xuICAgIH1cblxuICAgIHByaXZhdGUgX29uVGV4dElEM0ZyYW1lKGV2ZW50OiBUZXh0SUQzRnJhbWVFdmVudCk6IHZvaWQge1xuICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5UZXh0SUQzRnJhbWUsIGV2ZW50KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vblNsaWNlRW50ZXJlZChldmVudDogU2xpY2VFdmVudCk6IHZvaWQge1xuICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5TbGljZUVudGVyZWQsIGV2ZW50KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vbkJlYW1Mb2FkZWQoKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLl9pc1VwbHlua1VybCh0aGlzLl9hZGFwdGl2ZVNvdXJjZS5kb21haW4pKSB7XG4gICAgICAgICAgICB0aGlzLl9hc3NldEluZm9TZXJ2aWNlID0gbmV3IEFzc2V0SW5mb1NlcnZpY2UodGhpcy5fcHJvdG9jb2wsIHRoaXMuX2FkYXB0aXZlU291cmNlLmRvbWFpbiwgdGhpcy5fYWRhcHRpdmVTb3VyY2Uuc2Vzc2lvbklkKTtcbiAgICAgICAgICAgIHRoaXMuX3BpbmdTZXJ2aWNlID0gbmV3IFBpbmdTZXJ2aWNlKHRoaXMuX3Byb3RvY29sLCB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5kb21haW4sIHRoaXMuX2FkYXB0aXZlU291cmNlLnNlc3Npb25JZCwgdGhpcy5fdmlkZW8pO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fdmlkZW8udGV4dFRyYWNrcy5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCAoY2hhbmdlVHJhY2tFdmVudDogVHJhY2tFdmVudCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5vblRleHRUcmFja0NoYW5nZWQoY2hhbmdlVHJhY2tFdmVudCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLkJlYW1Mb2FkZWQpO1xuICAgIH1cblxuICAgIHByaXZhdGUgX29uVHJhY2tMb2FkZWQoKTogdm9pZCB7XG4gICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLlRyYWNrTG9hZGVkKTtcblxuICAgICAgICBpZiAoIXRoaXMuX2ZpcmVkUmVhZHlFdmVudCkge1xuICAgICAgICAgICAgdGhpcy5fZmlyZWRSZWFkeUV2ZW50ID0gdHJ1ZTtcbiAgICAgICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLlJlYWR5KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgX3N0YXJ0TWFpbkxvb3AoKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLl9pbnRlcnZhbElkID09PSAwKSB7XG4gICAgICAgICAgICB0aGlzLl9pbnRlcnZhbElkID0gc2V0SW50ZXJ2YWwodGhpcy5fb25UaW1lclRpY2ssIDE1KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgX3N0b3BNYWluTG9vcCgpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuX2ludGVydmFsSWQgIT09IDApIHtcbiAgICAgICAgICAgIGNsZWFySW50ZXJ2YWwodGhpcy5faW50ZXJ2YWxJZCk7XG4gICAgICAgICAgICB0aGlzLl9pbnRlcnZhbElkID0gMDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgX29uVGltZXJUaWNrKCk6IHZvaWQge1xuICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5vblRpY2soKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9pc1VwbHlua1VybCh1cmw6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgICAgICBjb25zdCB0ZW1wID0gdXJsLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIHJldHVybiB0ZW1wLmluZGV4T2YoJ3VwbHluay5jb20nKSA+IC0xIHx8IHRlbXAuaW5kZXhPZignZG93bmx5bmsuY29tJykgPiAtMTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vblNvdXJjZUxvYWRlZCgpOiB2b2lkIHtcbiAgICAgICAgLy9wcmUtbG9hZCBzZWdtZW50IG1hcCBzbyBhc3NldEluZm8gZGF0YSB3aWxsIGJlIGF2YWlsYWJsZSB3aGVuXG4gICAgICAgIC8vIG5ldyBzZWdtZW50cyBhcmUgZW5jb3VudGVyZWQuXG4gICAgICAgIC8vQ2hlY2sgaWYgd2UgaGF2ZSBhbiB1cGx5bmsgYXNzZXQsIGlmIG5vdC4uLi4gVGhlbiBqdXN0IHN0YXJ0IHBsYXliYWNrXG4gICAgICAgIGlmICh0aGlzLl9hc3NldEluZm9TZXJ2aWNlICYmIHRoaXMuX3NlZ21lbnRNYXApIHtcbiAgICAgICAgICAgIHRoaXMuX2Fzc2V0SW5mb1NlcnZpY2UubG9hZFNlZ21lbnRNYXAodGhpcy5fc2VnbWVudE1hcCwgKCkgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlLnN0YXJ0KCk7XG4gICAgICAgICAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuU291cmNlTG9hZGVkKTtcblxuICAgICAgICAgICAgICAgIC8vc2V0IHRoZSBwb3N0ZXIgdXJsXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuX2NvbmZpZy5zaG93UG9zdGVyICYmIHRoaXMucGxheWxpc3RUeXBlID09PSAnVk9EJykge1xuICAgICAgICAgICAgICAgICAgICBsZXQgY29udGVudFNlZ21lbnQgPSB0aGlzLl9zZWdtZW50TWFwLmNvbnRlbnRTZWdtZW50c1swXTtcbiAgICAgICAgICAgICAgICAgICAgbGV0IGNvbnRlbnRBc3NldCA9IHRoaXMuX2Fzc2V0SW5mb1NlcnZpY2UuZ2V0QXNzZXRJbmZvKGNvbnRlbnRTZWdtZW50LmlkKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNvbnRlbnRBc3NldCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fdmlkZW8ucG9zdGVyID0gY29udGVudEFzc2V0LnBvc3RlclVybDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2Uuc3RhcnQoKTtcbiAgICAgICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLlNvdXJjZUxvYWRlZCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIF9vbkxvYWRFcnJvcihtZXNzYWdlOiBzdHJpbmcsIGNvZGU6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5Mb2FkRXJyb3IsIHsgZXJyb3I6IG1lc3NhZ2UsIGNvZGU6IGNvZGUgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25Ecm1FcnJvcihtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuRHJtRXJyb3IsIHsgZXJyb3I6IG1lc3NhZ2UgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25TZWdtZW50TWFwQ2hhbmdlZCgpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMucGxheWxpc3RUeXBlID09PSBcIlZPRFwiKSB7XG4gICAgICAgICAgICBpZiAoIXRoaXMuX3NlZ21lbnRNYXApIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9zZWdtZW50TWFwID0gbmV3IFNlZ21lbnRNYXAodGhpcy5fYWRhcHRpdmVTb3VyY2Uuc2VnbWVudE1hcCk7XG4gICAgICAgICAgICAgICAgdGhpcy5faW5pdFNlZ21lbnRUZXh0VHJhY2soKTtcbiAgICAgICAgICAgICAgICB0aGlzLl9pbml0QWRCcmVha1RleHRUcmFjaygpO1xuXG4gICAgICAgICAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuU2VnbWVudE1hcExvYWRlZCwgeyBzZWdtZW50TWFwOiB0aGlzLl9zZWdtZW50TWFwIH0pO1xuICAgICAgICAgICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLkxvYWRlZEFkQnJlYWtzLCB7IGFkQnJlYWtzOiB0aGlzLl9zZWdtZW50TWFwLmFkQnJlYWtzIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5fc2VnbWVudE1hcCA9IG5ldyBTZWdtZW50TWFwKHRoaXMuX2FkYXB0aXZlU291cmNlLnNlZ21lbnRNYXApO1xuICAgICAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuU2VnbWVudE1hcExvYWRlZCwgeyBzZWdtZW50TWFwOiB0aGlzLl9zZWdtZW50TWFwIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfc3RhcnRMaWNlbnNlUmVxdWVzdChkcm1JbmZvOmFueSwga3NVcmw6c3RyaW5nKTogdm9pZCB7XG4gICAgICAgIHRoaXMuX2xpY2Vuc2VNYW5hZ2VyLnNldEtleVNlcnZlclByZWZpeChrc1VybCk7XG4gICAgICAgIHRoaXMuX2xpY2Vuc2VNYW5hZ2VyLmFkZExpY2Vuc2VSZXF1ZXN0KGRybUluZm8pO1xuICAgIH1cblxuICAgIHByaXZhdGUgX2xvYWRCYW5kd2lkdGhIaXN0b3J5KCk6IFNsaWNlRG93bmxvYWRNZXRyaWNbXVtdIHtcbiAgICAgICAgbGV0IGhpc3RvcnlWZXJzaW9uID0gcGFyc2VJbnQobG9jYWxTdG9yYWdlLmdldEl0ZW0oXCJVcGx5bmtIaXN0b3J5VmVyc2lvblwiKSwgMTApIHx8IDA7XG4gICAgICAgIC8vIEN1cnJlbnQgdmVyc2lvbiBpcyAyLiBJZiBvbGRlciB0aGFuIHRoYXQsIGRvbid0IGxvYWQgaXRcbiAgICAgICAgaWYgKGhpc3RvcnlWZXJzaW9uIDwgMiAmJiBsb2NhbFN0b3JhZ2UuZ2V0SXRlbShcIlVwbHlua0hpc3RvcnlcIikgIT0gbnVsbCkge1xuICAgICAgICAgICAgY29uc29sZS5sb2coXCJbYWRhcHRpdmUtcGxheWVyLnRzXSBfbG9hZEJhbmR3aWR0aEhpc3RvcnkgZm91bmQgYW4gb2xkZXIgaGlzdG9yeSB2ZXJzaW9uLiBSZW1vdmluZyBpdFwiKTtcbiAgICAgICAgICAgIGxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKFwiVXBseW5rSGlzdG9yeVwiKTtcbiAgICAgICAgICAgIGxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKFwiVXBseW5rSGlzdG9yeVRpbWVzdGFtcFwiKTtcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG4gICAgICAgIGxldCB0aW1lc3RhbXBTdHIgPSBsb2NhbFN0b3JhZ2UuZ2V0SXRlbShcIlVwbHlua0hpc3RvcnlUaW1lc3RhbXBcIik7XG4gICAgICAgIGxldCB0aW1lc3RhbXAgPSBwYXJzZUludCh0aW1lc3RhbXBTdHIsIDEwKSB8fCAwO1xuICAgICAgICBsZXQgbm93ID0gRGF0ZS5ub3coKTtcblxuICAgICAgICBjb25zdCBNQVhfQUdFID0gNjAgKiA2MCAqIDEwMDA7IC8vIDEgaHIsIGluIG1pbGxpc2VjXG4gICAgICAgIGlmIChub3cgLSB0aW1lc3RhbXAgPCBNQVhfQUdFKSB7XG4gICAgICAgICAgICBsZXQgaGlzdG9yeSA9IGxvY2FsU3RvcmFnZS5nZXRJdGVtKFwiVXBseW5rSGlzdG9yeVwiKTtcbiAgICAgICAgICAgIHJldHVybiBKU09OLnBhcnNlKGhpc3RvcnkpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIHByaXZhdGUgX3NhdmVCYW5kd2lkdGhIaXN0b3J5KGhpc3Rvcnk6IFNsaWNlRG93bmxvYWRNZXRyaWNbXVtdKTogdm9pZCB7XG4gICAgICAgIGlmIChoaXN0b3J5ID09IG51bGwpIHJldHVybjtcblxuICAgICAgICBsZXQgdGltZXN0YW1wID0gRGF0ZS5ub3coKVxuICAgICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbShcIlVwbHlua0hpc3RvcnlWZXJzaW9uXCIsIFwiMlwiKTtcbiAgICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oXCJVcGx5bmtIaXN0b3J5VGltZXN0YW1wXCIsIHRpbWVzdGFtcC50b1N0cmluZygpKTtcbiAgICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oXCJVcGx5bmtIaXN0b3J5XCIsIEpTT04uc3RyaW5naWZ5KGhpc3RvcnkpKTtcbiAgICB9XG5cbiAgICBnZXRUaHVtYm5haWwodGltZTogbnVtYmVyLCBzaXplOiBcInNtYWxsXCIgfCBcImxhcmdlXCIgPSBcInNtYWxsXCIpOiB0aHVtYi5UaHVtYm5haWwge1xuICAgICAgICByZXR1cm4gdGh1bWIuZ2V0VGh1bWJuYWlsKHRpbWUsIHRoaXMuX3NlZ21lbnRNYXAsIHRoaXMuX2Fzc2V0SW5mb1NlcnZpY2UsIHNpemUpO1xuICAgIH1cblxuICAgIHByaXZhdGUgX2luaXRTZWdtZW50VGV4dFRyYWNrKCk6IHZvaWQge1xuICAgICAgICBpZiAodHlwZW9mIFZUVEN1ZSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIC8vYmFpbCwgY2FuJ3QgY3JlYXRlIGN1ZXNcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBzZWdtZW50VGV4dFRyYWNrID0gdGhpcy5fZ2V0T3JDcmVhdGVUZXh0VHJhY2soXCJtZXRhZGF0YVwiLCBcInNlZ21lbnRzXCIpO1xuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fc2VnbWVudE1hcC5sZW5ndGg7IGkrKykge1xuXG4gICAgICAgICAgICBsZXQgc2VnbWVudCA9IHRoaXMuX3NlZ21lbnRNYXAuZ2V0U2VnbWVudEF0KGkpO1xuICAgICAgICAgICAgaWYgKHNlZ21lbnQgJiYgc2VnbWVudC5pZCAmJiBzZWdtZW50LmlkICE9PSAnJykge1xuICAgICAgICAgICAgICAgIGxldCBjdWUgPSBuZXcgVlRUQ3VlKHNlZ21lbnQuc3RhcnRUaW1lLCBzZWdtZW50LmVuZFRpbWUsIHNlZ21lbnQuaWQpO1xuXG4gICAgICAgICAgICAgICAgaWYgKGN1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgY3VlLmFkZEV2ZW50TGlzdGVuZXIoXCJlbnRlclwiLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5fYXNzZXRJbmZvU2VydmljZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX2Fzc2V0SW5mb1NlcnZpY2UubG9hZFNlZ21lbnQoc2VnbWVudCwgKGFzc2V0SW5mbzogQXNzZXRJbmZvKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLkFzc2V0RW50ZXJlZCwgeyBzZWdtZW50OiBzZWdtZW50LCBhc3NldDogYXNzZXRJbmZvIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5Bc3NldEVudGVyZWQsIHsgc2VnbWVudDogc2VnbWVudCwgYXNzZXQ6IG51bGwgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgICAgIGN1ZS5hZGRFdmVudExpc3RlbmVyKFwiZXhpdFwiLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5fYXNzZXRJbmZvU2VydmljZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX2Fzc2V0SW5mb1NlcnZpY2UubG9hZFNlZ21lbnQoc2VnbWVudCwgKGFzc2V0SW5mbzogQXNzZXRJbmZvKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLkFzc2V0RXhpdGVkLCB7IHNlZ21lbnQ6IHNlZ21lbnQsIGFzc2V0OiBhc3NldEluZm8gfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLkFzc2V0RW50ZXJlZCwgeyBzZWdtZW50OiBzZWdtZW50LCBhc3NldDogbnVsbCB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgc2VnbWVudFRleHRUcmFjay5hZGRDdWUoY3VlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIF9pbml0QWRCcmVha1RleHRUcmFjaygpOiB2b2lkIHtcbiAgICAgICAgaWYgKHR5cGVvZiBWVFRDdWUgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICAvL2JhaWwsIGNhbid0IGNyZWF0ZSBjdWVzXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgYWRCcmVha3MgPSB0aGlzLl9zZWdtZW50TWFwLmFkQnJlYWtzO1xuICAgICAgICBpZiAoYWRCcmVha3MubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgdHJhY2sgPSB0aGlzLl9nZXRPckNyZWF0ZVRleHRUcmFjayhcIm1ldGFkYXRhXCIsIFwiYWRicmVha3NcIik7XG5cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhZEJyZWFrcy5sZW5ndGg7IGkrKykge1xuXG4gICAgICAgICAgICBsZXQgYWRCcmVhayA9IGFkQnJlYWtzW2ldO1xuICAgICAgICAgICAgbGV0IGN1ZSA9IG5ldyBWVFRDdWUoYWRCcmVhay5zdGFydFRpbWUsIGFkQnJlYWsuZW5kVGltZSwgXCJhZGJyZWFrXCIpO1xuXG4gICAgICAgICAgICBpZiAoY3VlICE9PSB1bmRlZmluZWQpIHtcblxuICAgICAgICAgICAgICAgIGN1ZS5hZGRFdmVudExpc3RlbmVyKFwiZW50ZXJcIiwgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5BZEJyZWFrRW50ZXJlZCwgeyBhZEJyZWFrOiBhZEJyZWFrIH0pO1xuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgY3VlLmFkZEV2ZW50TGlzdGVuZXIoXCJleGl0XCIsICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuQWRCcmVha0V4aXRlZCwgeyBhZEJyZWFrOiBhZEJyZWFrIH0pO1xuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgdHJhY2suYWRkQ3VlKGN1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5faXNGaXJlZm94ICYmICF0aGlzLl92aWRlby5hdXRvcGxheSAmJiBhZEJyZWFrc1swXS5zdGFydFRpbWUgPT09IDAgJiYgdGhpcy5fdmlkZW8uY3VycmVudFRpbWUgPT09IDApIHtcbiAgICAgICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLkFkQnJlYWtFbnRlcmVkLCB7IGFkQnJlYWs6IGFkQnJlYWtzWzBdIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfZ2V0T3JDcmVhdGVUZXh0VHJhY2soa2luZDogc3RyaW5nLCBsYWJlbDogc3RyaW5nKTogVGV4dFRyYWNrIHtcbiAgICAgICAgLy9sb29rIGZvciBwcmV2aW91c2x5IGNyZWF0ZWQgdHJhY2tcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl92aWRlby50ZXh0VHJhY2tzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBsZXQgdHJhY2sgPSB0aGlzLl92aWRlby50ZXh0VHJhY2tzW2ldO1xuICAgICAgICAgICAgaWYgKHRyYWNrLmtpbmQgPT09IGtpbmQgJiYgdHJhY2subGFiZWwgPT09IGxhYmVsKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRyYWNrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy9yZXR1cm4gbmV3IHRyYWNrXG4gICAgICAgIHJldHVybiB0aGlzLl92aWRlby5hZGRUZXh0VHJhY2soa2luZCwgbGFiZWwpO1xuICAgIH1cblxuICAgIHB1YmxpYyBvblRleHRUcmFja0NoYW5nZWQoY2hhbmdlVHJhY2tFdmVudDogVHJhY2tFdmVudCk6IHZvaWQge1xuICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5vblRleHRUcmFja0NoYW5nZWQoY2hhbmdlVHJhY2tFdmVudCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSB1cGRhdGVWaWRlb1JlY3QoKTogdm9pZCB7XG4gICAgICAgIGxldCBjdXJyZW50VmlkZW9SZWN0ID0gdGhpcy5fdmlkZW8uZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cbiAgICAgICAgaWYgKCghdGhpcy5fdmlkZW9SZWN0KSB8fCAodGhpcy5fdmlkZW9SZWN0LndpZHRoICE9IGN1cnJlbnRWaWRlb1JlY3Qud2lkdGggfHwgdGhpcy5fdmlkZW9SZWN0LmhlaWdodCAhPSBjdXJyZW50VmlkZW9SZWN0LmhlaWdodCkpIHtcbiAgICAgICAgICAgIHRoaXMuX3ZpZGVvUmVjdCA9IGN1cnJlbnRWaWRlb1JlY3Q7XG4gICAgICAgICAgICBpZiAodGhpcy5fYWRhcHRpdmVTb3VyY2UgJiYgdGhpcy5fY29uZmlnLmxpbWl0UmVzb2x1dGlvblRvVmlld1NpemUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5zZXRNYXhWaWRlb1Jlc29sdXRpb24oY3VycmVudFZpZGVvUmVjdC5oZWlnaHQsIGN1cnJlbnRWaWRlb1JlY3Qud2lkdGgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25BdWRpb1RyYWNrU3dpdGNoZWQoKTogdm9pZCB7XG4gICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLkF1ZGlvVHJhY2tTd2l0Y2hlZCk7XG4gICAgfVxuXG4gICAgZ2V0IGF1ZGlvVHJhY2tzKCk6IFVwbHluay5BdWRpb1RyYWNrW10ge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVTb3VyY2UuYXVkaW9UcmFja3M7XG4gICAgfVxuXG4gICAgZ2V0IGF1ZGlvVHJhY2soKTogVXBseW5rLkF1ZGlvVHJhY2sge1xuICAgICAgICBsZXQgYXVkaW9UcmFja3MgPSB0aGlzLmF1ZGlvVHJhY2tzO1xuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYXVkaW9UcmFja3MubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGlmIChhdWRpb1RyYWNrc1tpXS5lbmFibGVkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGF1ZGlvVHJhY2tzW2ldO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgZ2V0IGF1ZGlvVHJhY2tJZCgpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVTb3VyY2UuYXVkaW9UcmFja0lkO1xuICAgIH1cblxuICAgIHNldCBhdWRpb1RyYWNrSWQoaWQ6IG51bWJlcikge1xuICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5hdWRpb1RyYWNrSWQgPSBpZDtcbiAgICB9XG5cbiAgICBnZXQgZG9tYWluKCk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5kb21haW47XG4gICAgfVxuXG4gICAgZ2V0IHNlc3Npb25JZCgpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVTb3VyY2Uuc2Vzc2lvbklkO1xuICAgIH1cblxuICAgIGdldCBudW1iZXJPZlJheXMoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlU291cmNlLm51bWJlck9mUmF5cztcbiAgICB9XG5cbiAgICBnZXQgYXZhaWxhYmxlQmFuZHdpZHRocygpOiBudW1iZXJbXSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5hdmFpbGFibGVCYW5kd2lkdGhzO1xuICAgIH1cblxuICAgIGdldCBhdmFpbGFibGVSZXNvbHV0aW9ucygpOiBSZXNvbHV0aW9uW10ge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVTb3VyY2UuYXZhaWxhYmxlUmVzb2x1dGlvbnM7XG4gICAgfVxuXG4gICAgZ2V0IGF2YWlsYWJsZU1pbWVUeXBlcygpOiBNaW1lVHlwZVtdIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlU291cmNlLmF2YWlsYWJsZU1pbWVUeXBlcztcbiAgICB9XG5cbiAgICBnZXQgc2VnbWVudE1hcCgpOiBTZWdtZW50TWFwIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3NlZ21lbnRNYXA7XG4gICAgfVxuXG4gICAgZ2V0IGFkQnJlYWtzKCk6IEFkQnJlYWtbXSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9zZWdtZW50TWFwLmFkQnJlYWtzO1xuICAgIH1cblxuICAgIGdldCBkdXJhdGlvbigpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVTb3VyY2UgPyB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5kdXJhdGlvbiA6IDA7XG4gICAgfVxuXG4gICAgZ2V0IHBsYXlsaXN0VHlwZSgpOiBcIlZPRFwiIHwgXCJFVkVOVFwiIHwgXCJMSVZFXCIge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVTb3VyY2UucGxheWxpc3RUeXBlO1xuICAgIH1cblxuICAgIGdldCBzdXBwb3J0c1RodW1ibmFpbHMoKTogYm9vbGVhbiB7XG4gICAgICAgIC8vb25seSBzdXBwb3J0IHRodW1ibmFpbHMgaWYgd2UgaGF2ZSB2aWRlbyAobm90IGF1ZGlvIG9ubHkpXG4gICAgICAgIHJldHVybiB0aGlzLmF2YWlsYWJsZVJlc29sdXRpb25zLmxlbmd0aCA+IDBcbiAgICB9XG5cbiAgICBnZXQgY2xhc3NOYW1lKCk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiAnQWRhcHRpdmVQbGF5ZXInO1xuICAgIH1cblxuICAgIGdldCB2ZXJzaW9uKCk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiAnMDIuMDAuMTgwNTA0MDAnOyAvL3dpbGwgYmUgbW9kaWZpZWQgYnkgdGhlIGJ1aWxkIHNjcmlwdFxuICAgIH1cblxuICAgIGdldCB2aWRlb0J1ZmZlcmVkKCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZVNvdXJjZS52aWRlb0J1ZmZlcmVkO1xuICAgIH1cblxuICAgIGdldCBhdWRpb0J1ZmZlcmVkKCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5hdWRpb0J1ZmZlcmVkO1xuICAgIH1cbn0iLCJleHBvcnQgY29uc3QgRXZlbnRzID0ge1xuICAgIEJlYW1Mb2FkZWQ6ICAgICAgICAgJ2JlYW1sb2FkZWQnLFxuICAgIFRyYWNrTG9hZGVkOiAgICAgICAgJ3RyYWNrbG9hZGVkJyxcbiAgICBTb3VyY2VMb2FkZWQ6ICAgICAgICdzb3VyY2Vsb2FkZWQnLFxuICAgIExvYWRFcnJvcjogICAgICAgICAgJ2xvYWRlcnJvcicsXG4gICAgRHJtRXJyb3I6ICAgICAgICAgICAnZHJtZXJyb3InLFxuICAgIFNlZ21lbnRNYXBMb2FkZWQ6ICAgJ3NlZ21lbnRtYXBMb2FkZWQnLFxuICAgIExvYWRlZEFkQnJlYWtzOiAgICAgJ2xvYWRlZGFkYnJlYWtzJyxcbiAgICBJRDNUYWc6ICAgICAgICAgICAgICdpZDNUYWcnLFxuICAgIFR4eHhJRDNGcmFtZTogICAgICAgJ3R4eHhJZDNGcmFtZScsXG4gICAgUHJpdklEM0ZyYW1lOiAgICAgICAncHJpdklkM0ZyYW1lJyxcbiAgICBUZXh0SUQzRnJhbWU6ICAgICAgICd0ZXh0SWQzRnJhbWUnLFxuICAgIFNsaWNlRW50ZXJlZDogICAgICAgJ3NsaWNlRW50ZXJlZCcsXG4gICAgQXNzZXRFbnRlcmVkOiAgICAgICAnYXNzZXRlbnRlcmVkJyxcbiAgICBBc3NldEV4aXRlZDogICAgICAgICdhc3NldGV4aXRlZCcsXG4gICAgQWRCcmVha0VudGVyZWQ6ICAgICAnYWRicmVha2VudGVyZWQnLFxuICAgIEFkQnJlYWtFeGl0ZWQ6ICAgICAgJ2FkYnJlYWtleGl0ZWQnLFxuICAgIFJlYWR5OiAgICAgICAgICAgICAgJ3JlYWR5JyxcbiAgICBBdWRpb1RyYWNrU3dpdGNoZWQ6ICdhdWRpb1RyYWNrU3dpdGNoZWQnLFxuICAgIEF1ZGlvVHJhY2tBZGRlZDogICAgJ2F1ZGlvVHJhY2tBZGRlZCcsXG59OyIsImltcG9ydCB7IHNsaWNlIH0gZnJvbSAnLi4vdXRpbHMvdXRpbHMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFR4eHhEYXRhIHtcbiAgICB0eXBlOiBzdHJpbmc7XG4gICAga2V5OiBzdHJpbmc7XG4gICAgdmFsdWU6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBUZXh0RnJhbWUge1xuICAgIHZhbHVlOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHh4eEZyYW1lIHtcbiAgICBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICAgIHZhbHVlOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJpdkZyYW1lIHtcbiAgICBvd25lcjogc3RyaW5nO1xuICAgIGRhdGE6IFVpbnQ4QXJyYXk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUQzRnJhbWUge1xuICAgIHR5cGU6IHN0cmluZztcbiAgICBzaXplOiBudW1iZXI7XG4gICAgZGF0YTogVWludDhBcnJheTtcbn1cblxuZXhwb3J0IGNsYXNzIElEM0RlY29kZXIge1xuXG4gICAgc3RhdGljIGdldEZyYW1lKGJ1ZmZlcjogVWludDhBcnJheSk6IElEM0ZyYW1lIHtcbiAgICAgICAgaWYgKGJ1ZmZlci5sZW5ndGggPCAyMSkge1xuICAgICAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8qIGh0dHA6Ly9pZDMub3JnL2lkM3YyLjMuMFxuICAgICAgICArLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0rXG4gICAgICAgIHwgICAgICBIZWFkZXIgKDEwIGJ5dGVzKSAgICAgIHxcbiAgICAgICAgKy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tK1xuICAgICAgICBbMF0gICAgID0gJ0knXG4gICAgICAgIFsxXSAgICAgPSAnRCdcbiAgICAgICAgWzJdICAgICA9ICczJ1xuICAgICAgICBbMyw0XSAgID0ge1ZlcnNpb259XG4gICAgICAgIFs1XSAgICAgPSB7RmxhZ3N9XG4gICAgICAgIFs2LTldICAgPSB7SUQzIFNpemV9XG4gICAgICAgIFsxMC0xM10gPSB7RnJhbWUgSUR9XG4gICAgICAgIFsxNC0xN10gPSB7RnJhbWUgU2l6ZX1cbiAgICAgICAgWzE4LDE5XSA9IHtGcmFtZSBGbGFnc30gXG4gICAgICAgICovXG4gICAgICAgIGlmIChidWZmZXJbMF0gPT09IDczICYmICAvLyBJXG4gICAgICAgICAgICBidWZmZXJbMV0gPT09IDY4ICYmICAvLyBEXG4gICAgICAgICAgICBidWZmZXJbMl0gPT09IDUxKSB7ICAvLyAzXG5cbiAgICAgICAgICAgIGxldCBmcmFtZVR5cGUgPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGJ1ZmZlclsxMF0sIGJ1ZmZlclsxMV0sIGJ1ZmZlclsxMl0sIGJ1ZmZlclsxM10pO1xuXG4gICAgICAgICAgICBsZXQgc2l6ZSA9IDA7XG4gICAgICAgICAgICBzaXplID0gKGJ1ZmZlclsxNF0gPDwgMjQpO1xuICAgICAgICAgICAgc2l6ZSB8PSAoYnVmZmVyWzE1XSA8PCAxNik7XG4gICAgICAgICAgICBzaXplIHw9IChidWZmZXJbMTZdIDw8IDgpO1xuICAgICAgICAgICAgc2l6ZSB8PSBidWZmZXJbMTddO1xuXG4gICAgICAgICAgICBsZXQgZGF0YSA9IHNsaWNlKGJ1ZmZlciwgMjApO1xuICAgICAgICAgICAgcmV0dXJuIHsgdHlwZTogZnJhbWVUeXBlLCBzaXplOiBzaXplLCBkYXRhOiBkYXRhIH07XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIHN0YXRpYyBkZWNvZGVUZXh0RnJhbWUoaWQzRnJhbWU6IElEM0ZyYW1lKTogVGV4dEZyYW1lIHtcbiAgICAgICAgLypcbiAgICAgICAgRm9ybWF0OlxuICAgICAgICBbMF0gICA9IHtUZXh0IEVuY29kaW5nfVxuICAgICAgICBbMS0/XSA9IHtWYWx1ZX1cbiAgICAgICAgKi9cblxuICAgICAgICBpZiAoaWQzRnJhbWUuc2l6ZSA8IDIpIHtcbiAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaWQzRnJhbWUuZGF0YVswXSAhPT0gMykge1xuICAgICAgICAgICAgLy9vbmx5IHN1cHBvcnQgVVRGLThcbiAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGxldCBkYXRhID0gc2xpY2UoaWQzRnJhbWUuZGF0YSwgMSk7XG4gICAgICAgIHJldHVybiB7IHZhbHVlOiBJRDNEZWNvZGVyLnV0ZjhBcnJheVRvU3RyKGRhdGEpIH07XG4gICAgfVxuXG4gICAgc3RhdGljIGRlY29kZVR4eHhGcmFtZShpZDNGcmFtZTogSUQzRnJhbWUpOiBUeHh4RnJhbWUge1xuICAgICAgICAvKlxuICAgICAgICBGb3JtYXQ6XG4gICAgICAgIFswXSAgID0ge1RleHQgRW5jb2Rpbmd9XG4gICAgICAgIFsxLT9dID0ge0Rlc2NyaXB0aW9ufVxcMHtWYWx1ZX1cbiAgICAgICAgKi9cblxuICAgICAgICBpZiAoaWQzRnJhbWUuc2l6ZSA8IDIpIHtcbiAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaWQzRnJhbWUuZGF0YVswXSAhPT0gMykge1xuICAgICAgICAgICAgLy9vbmx5IHN1cHBvcnQgVVRGLThcbiAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgaW5kZXggPSAxO1xuICAgICAgICBsZXQgZGVzY3JpcHRpb24gPSBJRDNEZWNvZGVyLnV0ZjhBcnJheVRvU3RyKHNsaWNlKGlkM0ZyYW1lLmRhdGEsIGluZGV4KSk7XG5cbiAgICAgICAgaW5kZXggKz0gZGVzY3JpcHRpb24ubGVuZ3RoICsgMTtcbiAgICAgICAgbGV0IHZhbHVlID0gSUQzRGVjb2Rlci51dGY4QXJyYXlUb1N0cihzbGljZShpZDNGcmFtZS5kYXRhLCBpbmRleCkpO1xuXG4gICAgICAgIHJldHVybiB7IGRlc2NyaXB0aW9uOiBkZXNjcmlwdGlvbiwgdmFsdWU6IHZhbHVlIH07XG4gICAgfVxuXG4gICAgc3RhdGljIGRlY29kZVByaXZGcmFtZShpZDNGcmFtZTogSUQzRnJhbWUpOiBQcml2RnJhbWUge1xuICAgICAgICAvKlxuICAgICAgICBGb3JtYXQ6IDx0ZXh0IHN0cmluZz5cXDA8YmluYXJ5IGRhdGE+XG4gICAgICAgICovXG5cbiAgICAgICAgaWYgKGlkM0ZyYW1lLnNpemUgPCAyKSB7XG4gICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICB9XG5cbiAgICAgICAgLy9maW5kIG51bGwgdGVybWluYXRvclxuICAgICAgICBsZXQgbnVsbEluZGV4ID0gMDtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBpZDNGcmFtZS5kYXRhLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBpZiAoaWQzRnJhbWUuZGF0YVtpXSA9PT0gMCkge1xuICAgICAgICAgICAgICAgIG51bGxJbmRleCA9IGk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgb3duZXIgPSBTdHJpbmcuZnJvbUNoYXJDb2RlLmFwcGx5KG51bGwsIHNsaWNlKGlkM0ZyYW1lLmRhdGEsIDAsIG51bGxJbmRleCkpO1xuICAgICAgICBsZXQgcHJpdmF0ZURhdGEgPSBzbGljZShpZDNGcmFtZS5kYXRhLCBudWxsSW5kZXggKyAxKTtcblxuICAgICAgICByZXR1cm4geyBvd25lcjogb3duZXIsIGRhdGE6IHByaXZhdGVEYXRhIH07XG4gICAgfVxuXG4gICAgLy8gaHR0cDovL3N0YWNrb3ZlcmZsb3cuY29tL3F1ZXN0aW9ucy84OTM2OTg0L3VpbnQ4YXJyYXktdG8tc3RyaW5nLWluLWphdmFzY3JpcHQvMjIzNzMxOTdcbiAgICAvLyBodHRwOi8vd3d3Lm9uaWNvcy5jb20vc3RhZmYvaXovYW11c2UvamF2YXNjcmlwdC9leHBlcnQvdXRmLnR4dFxuICAgIC8qIHV0Zi5qcyAtIFVURi04IDw9PiBVVEYtMTYgY29udmVydGlvblxuICAgICAqXG4gICAgICogQ29weXJpZ2h0IChDKSAxOTk5IE1hc2FuYW8gSXp1bW8gPGl6QG9uaWNvcy5jby5qcD5cbiAgICAgKiBWZXJzaW9uOiAxLjBcbiAgICAgKiBMYXN0TW9kaWZpZWQ6IERlYyAyNSAxOTk5XG4gICAgICogVGhpcyBsaWJyYXJ5IGlzIGZyZWUuICBZb3UgY2FuIHJlZGlzdHJpYnV0ZSBpdCBhbmQvb3IgbW9kaWZ5IGl0LlxuICAgICAqL1xuICAgIHN0YXRpYyB1dGY4QXJyYXlUb1N0cihhcnJheTogVWludDhBcnJheSk6IHN0cmluZyB7XG5cbiAgICAgICAgbGV0IGNoYXIyOiBhbnk7XG4gICAgICAgIGxldCBjaGFyMzogYW55O1xuICAgICAgICBsZXQgb3V0ID0gXCJcIjtcbiAgICAgICAgbGV0IGkgPSAwO1xuICAgICAgICBsZXQgbGVuZ3RoID0gYXJyYXkubGVuZ3RoO1xuXG4gICAgICAgIHdoaWxlIChpIDwgbGVuZ3RoKSB7XG4gICAgICAgICAgICBsZXQgYyA9IGFycmF5W2krK107XG4gICAgICAgICAgICBzd2l0Y2ggKGMgPj4gNCkge1xuICAgICAgICAgICAgICAgIGNhc2UgMDpcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgICAgICAgICBjYXNlIDE6IGNhc2UgMjogY2FzZSAzOiBjYXNlIDQ6IGNhc2UgNTogY2FzZSA2OiBjYXNlIDc6XG4gICAgICAgICAgICAgICAgICAgIC8vIDB4eHh4eHh4XG4gICAgICAgICAgICAgICAgICAgIG91dCArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGMpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlIDEyOiBjYXNlIDEzOlxuICAgICAgICAgICAgICAgICAgICAvLyAxMTB4IHh4eHggICAxMHh4IHh4eHhcbiAgICAgICAgICAgICAgICAgICAgY2hhcjIgPSBhcnJheVtpKytdO1xuICAgICAgICAgICAgICAgICAgICBvdXQgKz0gU3RyaW5nLmZyb21DaGFyQ29kZSgoKGMgJiAweDFGKSA8PCA2KSB8IChjaGFyMiAmIDB4M0YpKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAxNDpcbiAgICAgICAgICAgICAgICAgICAgLy8gMTExMCB4eHh4ICAxMHh4IHh4eHggIDEweHggeHh4eFxuICAgICAgICAgICAgICAgICAgICBjaGFyMiA9IGFycmF5W2krK107XG4gICAgICAgICAgICAgICAgICAgIGNoYXIzID0gYXJyYXlbaSsrXTtcbiAgICAgICAgICAgICAgICAgICAgb3V0ICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoKChjICYgMHgwRikgPDwgMTIpIHxcbiAgICAgICAgICAgICAgICAgICAgICAgICgoY2hhcjIgJiAweDNGKSA8PCA2KSB8XG4gICAgICAgICAgICAgICAgICAgICAgICAoKGNoYXIzICYgMHgzRikgPDwgMCkpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBvdXQ7XG4gICAgfVxufSIsImltcG9ydCB7IE9ic2VydmFibGUgfSBmcm9tICcuLi91dGlscy9vYnNlcnZhYmxlJztcbmltcG9ydCB7IFR4eHhEYXRhLCBUeHh4RnJhbWUsIFRleHRGcmFtZSwgUHJpdkZyYW1lLCBJRDNGcmFtZSwgSUQzRGVjb2RlciB9IGZyb20gJy4vaWQzLWRlY29kZXInO1xuaW1wb3J0IHsgYmFzZTY0VG9CdWZmZXIgfSBmcm9tICcuLi91dGlscy91dGlscyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHh4eElEM0ZyYW1lRXZlbnQge1xuICAgIGN1ZTogVGV4dFRyYWNrQ3VlO1xuICAgIGZyYW1lOiBUeHh4RnJhbWU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJpdklEM0ZyYW1lRXZlbnQge1xuICAgIGN1ZTogVGV4dFRyYWNrQ3VlO1xuICAgIGZyYW1lOiBQcml2RnJhbWU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVGV4dElEM0ZyYW1lRXZlbnQge1xuICAgIGN1ZTogVGV4dFRyYWNrQ3VlO1xuICAgIGZyYW1lOiBUZXh0RnJhbWU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUQzVGFnRXZlbnQge1xuICAgIGN1ZTogVGV4dFRyYWNrQ3VlO1xuICAgIGZyYW1lOiBJRDNGcmFtZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTbGljZUV2ZW50IHtcbiAgICBjdWU6IFRleHRUcmFja0N1ZTtcbiAgICBhc3NldElkOiBzdHJpbmc7XG4gICAgcmF5Q2hhcjogc3RyaW5nO1xuICAgIHNsaWNlSW5kZXg6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIFdlYktpdFR4eHhDdWUge1xuICAgIGtleTogc3RyaW5nO1xuICAgIGRhdGE6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIFdlYktpdFByaXZDdWUge1xuICAgIGtleTogc3RyaW5nO1xuICAgIGluZm86IHN0cmluZztcbiAgICBkYXRhOiBBcnJheUJ1ZmZlcjtcbn1cblxuZXhwb3J0IGNsYXNzIElEM0hhbmRsZXIgZXh0ZW5kcyBPYnNlcnZhYmxlIHtcbiAgICBjb25zdHJ1Y3Rvcih2aWRlbzogSFRNTFZpZGVvRWxlbWVudCkge1xuICAgICAgICBzdXBlcigpO1xuICAgICAgICB2aWRlby50ZXh0VHJhY2tzLmFkZEV2ZW50TGlzdGVuZXIoJ2FkZHRyYWNrJywgdGhpcy5fb25BZGRUcmFjay5iaW5kKHRoaXMpKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vbkFkZFRyYWNrKGFkZFRyYWNrRXZlbnQ6IGFueSkge1xuICAgICAgICBsZXQgdHJhY2s6IFRleHRUcmFjayA9IGFkZFRyYWNrRXZlbnQudHJhY2s7XG4gICAgICAgIGlmICh0aGlzLl9pc0lkM01ldGFkYXRhVHJhY2sodHJhY2spKSB7XG4gICAgICAgICAgICB0cmFjay5tb2RlID0gJ2hpZGRlbic7XG4gICAgICAgICAgICB0cmFjay5hZGRFdmVudExpc3RlbmVyKCdjdWVjaGFuZ2UnLCB0aGlzLl9vbklEM0N1ZUNoYW5nZS5iaW5kKHRoaXMpKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgX2lzSWQzTWV0YWRhdGFUcmFjayh0cmFjazogVGV4dFRyYWNrKTogYm9vbGVhbiB7XG4gICAgICAgIGlmICh0cmFjay5raW5kID09IFwibWV0YWRhdGFcIiAmJiB0cmFjay5sYWJlbCA9PSBcIklEM1wiKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0cmFjay5raW5kID09IFwibWV0YWRhdGFcIiAmJiB0cmFjay5pbkJhbmRNZXRhZGF0YVRyYWNrRGlzcGF0Y2hUeXBlKSB7XG4gICAgICAgICAgICB2YXIgZGlzcGF0Y2hUeXBlID0gdHJhY2suaW5CYW5kTWV0YWRhdGFUcmFja0Rpc3BhdGNoVHlwZTtcbiAgICAgICAgICAgIHJldHVybiBkaXNwYXRjaFR5cGUgPT09IFwiY29tLmFwcGxlLnN0cmVhbWluZ1wiIHx8IGRpc3BhdGNoVHlwZSA9PT0gXCIxNTI2MERGRkZGNDk0NDMzMjBGRjQ5NDQzMzIwMDAwRlwiO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIHByaXZhdGUgX29uSUQzQ3VlQ2hhbmdlKGN1ZUNoYW5nZUV2ZW50OiBhbnkpIHtcbiAgICAgICAgbGV0IHRyYWNrID0gY3VlQ2hhbmdlRXZlbnQudGFyZ2V0O1xuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdHJhY2suYWN0aXZlQ3Vlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgbGV0IGN1ZSA9IHRyYWNrLmFjdGl2ZUN1ZXNbaV07XG4gICAgICAgICAgICBpZiAoIWN1ZS5vbmVudGVyKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fb25JRDNDdWUoY3VlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdHJhY2suY3Vlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgbGV0IGN1ZSA9IHRyYWNrLmN1ZXNbaV07XG4gICAgICAgICAgICBpZiAoIWN1ZS5vbmVudGVyKSB7XG4gICAgICAgICAgICAgICAgY3VlLm9uZW50ZXIgPSAoY3VlRXZlbnQ6IGFueSkgPT4geyB0aGlzLl9vbklEM0N1ZShjdWVFdmVudC50YXJnZXQpOyB9O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25JRDNDdWUoY3VlOiBUZXh0VHJhY2tDdWUpIHtcbiAgICAgICAgbGV0IGRhdGE6IFVpbnQ4QXJyYXkgPSB1bmRlZmluZWQ7XG4gICAgICAgIGxldCBpZDNGcmFtZTogSUQzRnJhbWUgPSB1bmRlZmluZWQ7XG4gICAgICAgIGxldCB0eHh4RnJhbWU6IFR4eHhGcmFtZSA9IHVuZGVmaW5lZDtcbiAgICAgICAgbGV0IHRleHRGcmFtZTogVGV4dEZyYW1lID0gdW5kZWZpbmVkO1xuICAgICAgICBsZXQgcHJpdkZyYW1lOiBQcml2RnJhbWUgPSB1bmRlZmluZWQ7XG5cbiAgICAgICAgaWYgKCg8YW55PmN1ZSkuZGF0YSkge1xuICAgICAgICAgICAgLy9tcyBlZGdlIChuYXRpdmUpIHB1dHMgaWQzIGRhdGEgaW4gY3VlLmRhdGEgcHJvcGVydHlcbiAgICAgICAgICAgIGRhdGEgPSBuZXcgVWludDhBcnJheSgoPGFueT5jdWUpLmRhdGEpO1xuICAgICAgICB9IGVsc2UgaWYgKCg8YW55PmN1ZSkudmFsdWUgJiYgKDxhbnk+Y3VlKS52YWx1ZS5rZXkgJiYgKDxhbnk+Y3VlKS52YWx1ZS5kYXRhKSB7XG5cbiAgICAgICAgICAgIC8vc2FmYXJpIChuYXRpdmUpIHB1dHMgaWQzIGRhdGEgaW4gV2ViS2l0RGF0YUN1ZSBvYmplY3RzLlxuICAgICAgICAgICAgLy8gbm8gZW5jb2RlZCBkYXRhIGF2YWlsYWJsZS4gc2FmYXJpIGRlY29kZXMgZnJhbWVzIG5hdGl2ZWx5XG4gICAgICAgICAgICAvLyBpLmUuXG4gICAgICAgICAgICAvLyB2YWx1ZToge2tleTogXCJUWFhYXCIsIGRhdGE6IFwiNmMzNTM3ZWMzMzI0NDYxNDlmMWQ1NGRkYmViZWE0MTRfaF8wMDAwMDE0MFwifVxuICAgICAgICAgICAgLy8gb3JcbiAgICAgICAgICAgIC8vIHZhbHVlOiB7a2V5OiBcIlBSSVZcIiwgaW5mbzogXCJjb20uZXNwbi5hdXRobmV0LmhlYXJ0YmVhdFwiLCBkYXRhOiBBcnJheUJ1ZmZlcn1cblxuICAgICAgICAgICAgaWYgKCg8YW55PmN1ZSkudmFsdWUua2V5ID09PSAnVFhYWCcpIHtcbiAgICAgICAgICAgICAgICBsZXQgdHh4eEN1ZTogV2ViS2l0VHh4eEN1ZSA9ICg8YW55PmN1ZSkudmFsdWU7XG4gICAgICAgICAgICAgICAgdHh4eEZyYW1lID0geyB2YWx1ZTogdHh4eEN1ZS5kYXRhLCBkZXNjcmlwdGlvbjogdW5kZWZpbmVkIH07XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCg8YW55PmN1ZSkudmFsdWUua2V5ID09PSAnUFJJVicpIHtcbiAgICAgICAgICAgICAgICBsZXQgcHJpdkN1ZTogV2ViS2l0UHJpdkN1ZSA9ICg8YW55PmN1ZSkudmFsdWU7XG4gICAgICAgICAgICAgICAgcHJpdkZyYW1lID0geyBvd25lcjogcHJpdkN1ZS5pbmZvLCBkYXRhOiBuZXcgVWludDhBcnJheShwcml2Q3VlLmRhdGEpIH07XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvL3VwbHluayBjcmVhdGVkIGlkMyBjdWVzXG4gICAgICAgICAgICBkYXRhID0gYmFzZTY0VG9CdWZmZXIoY3VlLnRleHQpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGRhdGEpIHtcbiAgICAgICAgICAgIGlkM0ZyYW1lID0gSUQzRGVjb2Rlci5nZXRGcmFtZShkYXRhKTtcbiAgICAgICAgICAgIGlmIChpZDNGcmFtZSkge1xuICAgICAgICAgICAgICAgIGlmIChpZDNGcmFtZS50eXBlID09PSAnVFhYWCcpIHtcbiAgICAgICAgICAgICAgICAgICAgdHh4eEZyYW1lID0gSUQzRGVjb2Rlci5kZWNvZGVUeHh4RnJhbWUoaWQzRnJhbWUpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoaWQzRnJhbWUudHlwZSA9PT0gJ1BSSVYnKSB7XG4gICAgICAgICAgICAgICAgICAgIHByaXZGcmFtZSA9IElEM0RlY29kZXIuZGVjb2RlUHJpdkZyYW1lKGlkM0ZyYW1lKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGlkM0ZyYW1lLnR5cGVbMF0gPT09ICdUJykge1xuICAgICAgICAgICAgICAgICAgICB0ZXh0RnJhbWUgPSBJRDNEZWNvZGVyLmRlY29kZVRleHRGcmFtZShpZDNGcmFtZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGlkM0ZyYW1lKSB7XG4gICAgICAgICAgICBsZXQgZXZlbnQ6IElEM1RhZ0V2ZW50ID0geyBjdWU6IGN1ZSwgZnJhbWU6IGlkM0ZyYW1lIH07XG4gICAgICAgICAgICBzdXBlci5maXJlKElEM0hhbmRsZXIuRXZlbnQuSUQzVGFnLCBldmVudCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodHh4eEZyYW1lKSB7XG4gICAgICAgICAgICBsZXQgdHh4eEV2ZW50OiBUeHh4SUQzRnJhbWVFdmVudCA9IHsgY3VlOiBjdWUsIGZyYW1lOiB0eHh4RnJhbWUgfTtcbiAgICAgICAgICAgIHN1cGVyLmZpcmUoSUQzSGFuZGxlci5FdmVudC5UeHh4SUQzRnJhbWUsIHR4eHhFdmVudCk7XG5cbiAgICAgICAgICAgIGlmICh0eHh4RnJhbWUudmFsdWUpIHtcbiAgICAgICAgICAgICAgICBsZXQgc2xpY2VEYXRhID0gdHh4eEZyYW1lLnZhbHVlLnNwbGl0KCdfJyk7XG4gICAgICAgICAgICAgICAgaWYgKHNsaWNlRGF0YS5sZW5ndGggPT0gMykge1xuICAgICAgICAgICAgICAgICAgICBsZXQgc2xpY2VFdmVudDogU2xpY2VFdmVudCA9IHsgY3VlOiBjdWUsIGFzc2V0SWQ6IHNsaWNlRGF0YVswXSwgcmF5Q2hhcjogc2xpY2VEYXRhWzFdLCBzbGljZUluZGV4OiBwYXJzZUludChzbGljZURhdGFbMl0sIDE2KSB9O1xuICAgICAgICAgICAgICAgICAgICBzdXBlci5maXJlKElEM0hhbmRsZXIuRXZlbnQuU2xpY2VFbnRlcmVkLCBzbGljZUV2ZW50KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAocHJpdkZyYW1lKSB7XG4gICAgICAgICAgICBsZXQgcHJpdkV2ZW50OiBQcml2SUQzRnJhbWVFdmVudCA9IHsgY3VlOiBjdWUsIGZyYW1lOiBwcml2RnJhbWUgfTtcbiAgICAgICAgICAgIHN1cGVyLmZpcmUoSUQzSGFuZGxlci5FdmVudC5Qcml2SUQzRnJhbWUsIHByaXZFdmVudCk7XG4gICAgICAgIH0gZWxzZSBpZiAodGV4dEZyYW1lKSB7XG4gICAgICAgICAgICBsZXQgdGV4dEV2ZW50OiBUZXh0SUQzRnJhbWVFdmVudCA9IHsgY3VlOiBjdWUsIGZyYW1lOiB0ZXh0RnJhbWUgfTtcbiAgICAgICAgICAgIHN1cGVyLmZpcmUoSUQzSGFuZGxlci5FdmVudC5UZXh0SUQzRnJhbWUsIHRleHRFdmVudCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBzdGF0aWMgZ2V0IEV2ZW50KCkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgSUQzVGFnOiAnaWQzVGFnJyxcbiAgICAgICAgICAgIFR4eHhJRDNGcmFtZTogJ3R4eHhJZDNGcmFtZScsXG4gICAgICAgICAgICBQcml2SUQzRnJhbWU6ICdwcml2SWQzRnJhbWUnLFxuICAgICAgICAgICAgVGV4dElEM0ZyYW1lOiAndGV4dElkM0ZyYW1lJyxcbiAgICAgICAgICAgIFNsaWNlRW50ZXJlZDogJ3NsaWNlRW50ZXJlZCdcbiAgICAgICAgfTtcbiAgICB9XG59IiwiaW1wb3J0ICogYXMgdXRpbHMgZnJvbSAnLi91dGlscy91dGlscyc7XG5cbmV4cG9ydCBjbGFzcyBMaWNlbnNlTWFuYWdlckZQIHtcbiAgICBwcml2YXRlIF92aWRlbzogSFRNTFZpZGVvRWxlbWVudDtcbiAgICBwcml2YXRlIF9jZXJ0aWZpY2F0ZVBhdGg6IHN0cmluZztcbiAgICBwcml2YXRlIF9jZXJ0aWZpY2F0ZURhdGE6IFVpbnQ4QXJyYXk7XG5cbiAgICBjb25zdHJ1Y3Rvcih2aWRlbzogSFRNTFZpZGVvRWxlbWVudCkge1xuICAgICAgICB0aGlzLl92aWRlbyA9IHZpZGVvO1xuICAgICAgICB0aGlzLl9jZXJ0aWZpY2F0ZVBhdGggPSBudWxsO1xuICAgICAgICB0aGlzLl9jZXJ0aWZpY2F0ZURhdGEgPSBudWxsO1xuXG4gICAgICAgIGxldCBzZWxmID0gdGhpcztcbiAgICAgICAgdGhpcy5fdmlkZW8uYWRkRXZlbnRMaXN0ZW5lcignd2Via2l0bmVlZGtleScsIGZ1bmN0aW9uKGV2ZW50OiBhbnkpIHsgc2VsZi5fb25XZWJLaXROZWVkS2V5KGV2ZW50LnRhcmdldCwgZXZlbnQuaW5pdERhdGEpOyB9KTtcbiAgICB9XG5cbiAgICBwdWJsaWMgbG9hZChjZXJ0aWZpY2F0ZVBhdGg6IHN0cmluZykge1xuICAgICAgICB0aGlzLl9jZXJ0aWZpY2F0ZVBhdGggPSBjZXJ0aWZpY2F0ZVBhdGg7XG4gICAgICAgIGlmICh0aGlzLl9jZXJ0aWZpY2F0ZVBhdGggPT0gbnVsbCB8fCB0aGlzLl9jZXJ0aWZpY2F0ZVBhdGggPT0gXCJcIikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIltMaWNlbnNlTWFuYWdlckZQXSBObyBGYWlycGxheSBjZXJ0aWZpY2F0ZSBwYXRoIGdpdmVuLiBDYW5ub3QgcGxheS5cIilcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBpZiAoV2ViS2l0TWVkaWFLZXlzID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJbTGljZW5zZU1hbmFnZXJGUF0gTm8gRmFpcnBsYXkgYnJvd3NlciBzdXBwb3J0IGRldGVjdGVkLiBDYW5ub3QgcGxheS5cIilcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBzZWxmID0gdGhpcztcbiAgICAgICAgbGV0IHhociA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xuICAgICAgICB4aHIucmVzcG9uc2VUeXBlID0gJ2FycmF5YnVmZmVyJztcbiAgICAgICAgeGhyLm9ucmVhZHlzdGF0ZWNoYW5nZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGlmICh4aHIucmVhZHlTdGF0ZSA9PT0gNCkge1xuICAgICAgICAgICAgICAgIGlmICh4aHIuc3RhdHVzID09PSAyMDApIHtcbiAgICAgICAgICAgICAgICAgICAgc2VsZi5vbkNlcnRpZmljYXRlTG9hZGVkKHhoci5yZXNwb25zZSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgJ1tMaWNlbnNlTWFuYWdlckZQXSAtIEZhaWxlZCB0byByZXRyaWV2ZSB0aGUgc2VydmVyIGNlcnRpZmljYXRlICgnICsgc2VsZi5fY2VydGlmaWNhdGVQYXRoICsgJykuIFN0YXR1czogJyArIHhoci5zdGF0dXMgKyAnICgnICsgeGhyLnN0YXR1c1RleHQgKyAnKSc7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICB4aHIub3BlbignR0VUJywgdGhpcy5fY2VydGlmaWNhdGVQYXRoLCB0cnVlKTtcbiAgICAgICAgeGhyLnNldFJlcXVlc3RIZWFkZXIoJ1ByYWdtYScsICdDYWNoZS1Db250cm9sOiBuby1jYWNoZScpO1xuICAgICAgICB4aHIuc2V0UmVxdWVzdEhlYWRlcihcIkNhY2hlLUNvbnRyb2xcIiwgXCJtYXgtYWdlPTBcIik7XG4gICAgICAgIHhoci5zZW5kKCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBvbkNlcnRpZmljYXRlTG9hZGVkKGRhdGE6IEFycmF5QnVmZmVyKTogdm9pZCB7XG4gICAgICAgIHRoaXMuX2NlcnRpZmljYXRlRGF0YSA9IG5ldyBVaW50OEFycmF5KGRhdGEpO1xuICAgICAgICBjb25zb2xlLmxvZyhcIltMaWNlbnNlTWFuYWdlckZQXSBDZXJ0aWZpY2F0ZSBsb2FkZWQgc3VjY2Vzc2Z1bGx5XCIpO1xuXG4gICAgICAgIC8vIHRoaXMuX3ZpZGVvLnNyYyBhbHJlYWR5IHNldCBpbiBOYXRpdmVQbGF5ZXIgY2xhc3NcbiAgICAgICAgdGhpcy5fdmlkZW8ubG9hZCgpO1xuICAgIH1cblxuICAgIC8vIHVzZSBgdmlkZW86IGFueWAgaW5zdGVhZCBvZiBgdmlkZW86IEhUTUxWaWRlb0VsZW1lbnRgIGJlY2F1c2UgdHlwZXNjcmlwdCBjb21wbGFpbnMgYWJvdXQgd2Via2l0KiBzdHVmZlxuICAgIHByaXZhdGUgX29uV2ViS2l0TmVlZEtleSh2aWRlbzogYW55LCBpbml0RGF0YTogVWludDE2QXJyYXkpOiB2b2lkIHtcbiAgICAgICAgaWYgKGluaXREYXRhID09PSBudWxsKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpcnBsYXkgRFJNIG5lZWRzIGEga2V5LCBidXQgbm8gaW5pdCBkYXRhIGF2YWlsYWJsZS5cIik7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuX2NlcnRpZmljYXRlRGF0YSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaXJwbGF5IERSTSBuZWVkcyBhIGtleSwgYnV0IG5vIGNlcnRpZmljYXRlIGRhdGEgYXZhaWxhYmxlLlwiKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBkZXN0VXJsID0gdGhpcy5nZXRTUENVcmwoaW5pdERhdGEpO1xuICAgICAgICBsZXQgY29udGVudERhdGEgPSB0aGlzLmV4dHJhY3RDb250ZW50SWQoZGVzdFVybCk7XG4gICAgICAgIGxldCBzZXNzaW9uRGF0YSA9IHRoaXMuY29uY2F0SW5pdERhdGFJZEFuZENlcnRpZmljYXRlKGluaXREYXRhLCBjb250ZW50RGF0YSk7XG5cbiAgICAgICAgaWYgKCF2aWRlby53ZWJraXRLZXlzKSB7XG4gICAgICAgICAgICBsZXQga2V5U3lzdGVtID0gdGhpcy5zZWxlY3RLZXlTeXN0ZW0oKTtcbiAgICAgICAgICAgIHZpZGVvLndlYmtpdFNldE1lZGlhS2V5cyhuZXcgV2ViS2l0TWVkaWFLZXlzKGtleVN5c3RlbSkpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCF2aWRlby53ZWJraXRLZXlzKVxuICAgICAgICAgICAgdGhyb3cgXCJDb3VsZCBub3QgY3JlYXRlIE1lZGlhS2V5c1wiO1xuXG4gICAgICAgIGxldCBrZXlTZXNzaW9uID0gdmlkZW8ud2Via2l0S2V5cy5jcmVhdGVTZXNzaW9uKFwidmlkZW8vbXA0XCIsIHNlc3Npb25EYXRhKTtcbiAgICAgICAgaWYgKCFrZXlTZXNzaW9uKVxuICAgICAgICAgICAgdGhyb3cgXCJDb3VsZCBub3QgY3JlYXRlIGtleSBzZXNzaW9uXCI7XG4gICAgICAgIGtleVNlc3Npb24uY29udGVudElkID0gY29udGVudERhdGE7XG4gICAgICAgIGtleVNlc3Npb24uZGVzdGluYXRpb25VUkwgPSBkZXN0VXJsO1xuICAgICAgICBsZXQgc2VsZiA9IHRoaXM7XG4gICAgICAgIGtleVNlc3Npb24uYWRkRXZlbnRMaXN0ZW5lcignd2Via2l0a2V5bWVzc2FnZScsIGZ1bmN0aW9uIChldmVudDogYW55KSB7XG4gICAgICAgICAgICBzZWxmLmxpY2Vuc2VSZXF1ZXN0UmVhZHkoZXZlbnQudGFyZ2V0LCBldmVudC5tZXNzYWdlKTtcbiAgICAgICAgfSk7XG4gICAgICAgIGtleVNlc3Npb24uYWRkRXZlbnRMaXN0ZW5lcignd2Via2l0a2V5YWRkZWQnLCBmdW5jdGlvbiAoZXZlbnQ6IGFueSkgeyBzZWxmLm9ua2V5YWRkZWQoKTsgfSk7XG4gICAgICAgIGtleVNlc3Npb24uYWRkRXZlbnRMaXN0ZW5lcignd2Via2l0a2V5ZXJyb3InLCBmdW5jdGlvbiAoZXZlbnQ6IGFueSkgeyBzZWxmLm9ua2V5ZXJyb3IoKTsgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBleHRyYWN0Q29udGVudElkKHNwY1VybDogc3RyaW5nKTogc3RyaW5nIHtcbiAgICAgICAgLy8gY29udGVudElkIGlzIHBhc3NlZCB1cCBhcyBhIFVSSSwgZnJvbSB3aGljaCB0aGUgaG9zdCBtdXN0IGJlIGV4dHJhY3RlZDpcbiAgICAgICAgbGV0IGxpbmsgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XG4gICAgICAgIGxpbmsuaHJlZiA9IHNwY1VybDtcbiAgICAgICAgbGV0IHF1ZXJ5ID0gbGluay5zZWFyY2guc3Vic3RyKDEpO1xuICAgICAgICBsZXQgaWQgPSBxdWVyeS5zcGxpdChcIiZcIik7XG4gICAgICAgIGxldCBpdGVtID0gaWRbMF0uc3BsaXQoXCI9XCIpO1xuICAgICAgICBsZXQgY2lkID0gaXRlbVsxXTtcbiAgICAgICAgcmV0dXJuIGNpZDtcbiAgICB9XG5cbiAgICBwcml2YXRlIGdldFNQQ1VybChpbml0RGF0YTogVWludDE2QXJyYXkpOiBzdHJpbmcge1xuICAgICAgICBsZXQgc2tkdXJsID0gdXRpbHMuYXJyYXkxNlRvU3RyaW5nKGluaXREYXRhKTtcbiAgICAgICAgLy8gY29udGVudElkIGlzIHBhc3NlZCB1cCBhcyBhIFVSSSwgZnJvbSB3aGljaCB0aGUgaG9zdCBtdXN0IGJlIGV4dHJhY3RlZDpcbiAgICAgICAgbGV0IHNwY3VybCA9IHNrZHVybC5yZXBsYWNlKCdza2Q6Ly8nLCAnaHR0cHM6Ly8nKTtcbiAgICAgICAgc3BjdXJsID0gc3BjdXJsLnN1YnN0cmluZygxLCBzcGN1cmwubGVuZ3RoKTtcbiAgICAgICAgcmV0dXJuIHNwY3VybDtcbiAgICB9XG5cbiAgICBwcml2YXRlIGNvbmNhdEluaXREYXRhSWRBbmRDZXJ0aWZpY2F0ZShpbml0RGF0YTogVWludDE2QXJyYXksIGlkOiBhbnkpOiBVaW50OEFycmF5IHtcbiAgICAgICAgaWYgKHR5cGVvZiBpZCA9PSBcInN0cmluZ1wiKVxuICAgICAgICAgICAgaWQgPSB1dGlscy5zdHJpbmdUb0FycmF5MTYoaWQpO1xuICAgICAgICAvLyBsYXlvdXQgaXMgW2luaXREYXRhXVs0IGJ5dGU6IGlkTGVuZ3RoXVtpZExlbmd0aCBieXRlOiBpZF1bNCBieXRlOmNlcnRMZW5ndGhdW2NlcnRMZW5ndGggYnl0ZTogY2VydF1cbiAgICAgICAgbGV0IG9mZnNldCA9IDA7XG4gICAgICAgIGxldCBidWZmZXIgPSBuZXcgQXJyYXlCdWZmZXIoaW5pdERhdGEuYnl0ZUxlbmd0aCArIDQgKyBpZC5ieXRlTGVuZ3RoICsgNCArIHRoaXMuX2NlcnRpZmljYXRlRGF0YS5ieXRlTGVuZ3RoKTtcbiAgICAgICAgbGV0IGRhdGFWaWV3ID0gbmV3IERhdGFWaWV3KGJ1ZmZlcik7XG5cbiAgICAgICAgbGV0IGluaXREYXRhQXJyYXkgPSBuZXcgVWludDhBcnJheShidWZmZXIsIG9mZnNldCwgaW5pdERhdGEuYnl0ZUxlbmd0aCk7XG4gICAgICAgIGluaXREYXRhQXJyYXkuc2V0KGluaXREYXRhKTtcbiAgICAgICAgb2Zmc2V0ICs9IGluaXREYXRhLmJ5dGVMZW5ndGg7XG5cbiAgICAgICAgZGF0YVZpZXcuc2V0VWludDMyKG9mZnNldCwgaWQuYnl0ZUxlbmd0aCwgdHJ1ZSk7XG4gICAgICAgIG9mZnNldCArPSA0O1xuXG4gICAgICAgIGxldCBpZEFycmF5ID0gbmV3IFVpbnQ4QXJyYXkoYnVmZmVyLCBvZmZzZXQsIGlkLmJ5dGVMZW5ndGgpO1xuICAgICAgICBpZEFycmF5LnNldChpZCk7XG4gICAgICAgIG9mZnNldCArPSBpZEFycmF5LmJ5dGVMZW5ndGg7XG5cbiAgICAgICAgZGF0YVZpZXcuc2V0VWludDMyKG9mZnNldCwgdGhpcy5fY2VydGlmaWNhdGVEYXRhLmJ5dGVMZW5ndGgsIHRydWUpO1xuICAgICAgICBvZmZzZXQgKz0gNDtcblxuICAgICAgICBsZXQgY2VydEFycmF5ID0gbmV3IFVpbnQ4QXJyYXkoYnVmZmVyLCBvZmZzZXQsIHRoaXMuX2NlcnRpZmljYXRlRGF0YS5ieXRlTGVuZ3RoKTtcbiAgICAgICAgY2VydEFycmF5LnNldCh0aGlzLl9jZXJ0aWZpY2F0ZURhdGEpO1xuXG4gICAgICAgIHJldHVybiBuZXcgVWludDhBcnJheShidWZmZXIsIDAsIGJ1ZmZlci5ieXRlTGVuZ3RoKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHNlbGVjdEtleVN5c3RlbSgpOiBzdHJpbmcge1xuICAgICAgICBpZiAoV2ViS2l0TWVkaWFLZXlzLmlzVHlwZVN1cHBvcnRlZChcImNvbS5hcHBsZS5mcHMuMV8wXCIsIFwidmlkZW8vbXA0XCIpKSB7XG4gICAgICAgICAgICByZXR1cm4gXCJjb20uYXBwbGUuZnBzLjFfMFwiO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhyb3cgXCJLZXkgU3lzdGVtIG5vdCBzdXBwb3J0ZWRcIjtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgbGljZW5zZVJlcXVlc3RSZWFkeShzZXNzaW9uOiBhbnksIG1lc3NhZ2U6IGFueSk6IHZvaWQge1xuICAgICAgICBsZXQgc2VsZiA9IHRoaXM7XG4gICAgICAgIGxldCB4aHIgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcbiAgICAgICAgeGhyLnJlc3BvbnNlVHlwZSA9ICdqc29uJztcbiAgICAgICAgKHhociBhcyBhbnkpLnNlc3Npb24gPSBzZXNzaW9uO1xuICAgICAgICB4aHIub25yZWFkeXN0YXRlY2hhbmdlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKHhoci5yZWFkeVN0YXRlID09PSA0KSB7XG4gICAgICAgICAgICAgICAgaWYgKHhoci5zdGF0dXMgPT09IDIwMCkge1xuICAgICAgICAgICAgICAgICAgICBzZWxmLmxpY2Vuc2VSZXF1ZXN0TG9hZGVkKHhoci5yZXNwb25zZSwgKHhociBhcyBhbnkpLnNlc3Npb24pO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGxldCBleCA9IEpTT04uc3RyaW5naWZ5KHNlc3Npb24ucmVzcG9uc2UpO1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyAnW0xpY2Vuc2VNYW5hZ2VyRlBdIGxpY2Vuc2UgcmVxdWVzdCBmYWlsZWQgJyArIChleCA/IGV4IDogJycpICsgJygnICsgc2Vzc2lvbi5kZXN0aW5hdGlvblVSTCArICcpLiBTdGF0dXM6ICcgKyB4aHIuc3RhdHVzICsgJyAoJyArIHhoci5zdGF0dXNUZXh0ICsgJyknO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBsZXQgcGF5bG9hZDogYW55ID0ge307XG4gICAgICAgIHBheWxvYWRbXCJzcGNcIl0gPSB1dGlscy5iYXNlNjRFbmNvZGVVaW50OEFycmF5KG1lc3NhZ2UpO1xuICAgICAgICBwYXlsb2FkW1wiYXNzZXRJZFwiXSA9IHNlc3Npb24uY29udGVudElkO1xuICAgICAgICB4aHIub3BlbignUE9TVCcsIHNlc3Npb24uZGVzdGluYXRpb25VUkwsIHRydWUpO1xuICAgICAgICB4aHIuc2VuZChKU09OLnN0cmluZ2lmeShwYXlsb2FkKSk7XG5cbiAgICAgICAgd2luZG93LmNvbnNvbGUubG9nKFwiW0xpY2Vuc2VNYW5hZ2VyRlBdIEZhaXJwbGF5IGtleSByZXF1ZXN0ZWQgZm9yIGFzc2V0IFwiICsgc2Vzc2lvbi5jb250ZW50SWQpO1xuICAgIH1cblxuICAgIHByaXZhdGUgbGljZW5zZVJlcXVlc3RMb2FkZWQoZGF0YTogYW55LCBzZXNzaW9uOiBhbnkpOiB2b2lkIHtcbiAgICAgICAgbGV0IGtleSA9IHV0aWxzLmJhc2U2NERlY29kZVVpbnQ4QXJyYXkoZGF0YVsnY2tjJ10pO1xuICAgICAgICBzZXNzaW9uLnVwZGF0ZShrZXkpO1xuICAgIH1cblxuICAgIHByaXZhdGUgb25rZXllcnJvcigpOiB2b2lkIHtcbiAgICAgICAgd2luZG93LmNvbnNvbGUuZXJyb3IoJ1tMaWNlbnNlTWFuYWdlckZQXSBGYWlycGxheSBkZWNyeXB0aW9uIGtleSBlcnJvciB3YXMgZW5jb3VudGVyZWQnKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIG9ua2V5YWRkZWQoKTogdm9pZCB7XG4gICAgICAgIHdpbmRvdy5jb25zb2xlLmxvZygnW0xpY2Vuc2VNYW5hZ2VyRlBdIEZhaXJwbGF5IGRlY3J5cHRpb24ga2V5IHdhcyBhZGRlZCB0byBzZXNzaW9uLicpO1xuICAgIH1cbn1cbiIsImltcG9ydCAqIGFzIHV0aWxzIGZyb20gJy4vdXRpbHMvdXRpbHMnO1xuXG5jbGFzcyBLZXlSZXF1ZXN0RGF0YSB7XG4gICAgcHVibGljIHdpZGV2aW5lOiBzdHJpbmc7IC8vIFBTU0ggZm9yIHdpZGV2aW5lXG4gICAgcHVibGljIHBsYXlyZWFkeTogc3RyaW5nOyAvLyBQU1NIIGZvciBwbGF5cmVhZHlcbn1cblxuZXhwb3J0IGNsYXNzIExpY2Vuc2VNYW5hZ2VyIHtcblxuICAgIHJlYWRvbmx5IExJQ0VOU0VfVFlQRV9XSURFVklORSA9ICdlZGVmOGJhOS03OWQ2LTRhY2UtYTNjOC0yN2RjZDUxZDIxZWQnO1xuICAgIHJlYWRvbmx5IExJQ0VOU0VfVFlQRV9QTEFZUkVBRFkgPSAnOWEwNGYwNzktOTg0MC00Mjg2LWFiOTItZTY1YmUwODg1Zjk1JztcblxuICAgIHByaXZhdGUgX3ZpZGVvOiBIVE1MVmlkZW9FbGVtZW50O1xuICAgIHByaXZhdGUgX2FkYXB0aXZlU291cmNlOiBNb2R1bGUuQWRhcHRpdmVTb3VyY2U7XG5cbiAgICBwcml2YXRlIF9rZXlTZXJ2ZXJQcmVmaXg6IHN0cmluZztcbiAgICBwcml2YXRlIF9saWNlbnNlVHlwZSA9ICcnO1xuICAgIHByaXZhdGUgX3Bzc2g6IFVpbnQ4QXJyYXk7XG4gICAgcHJpdmF0ZSBfbWVkaWFLZXlzOiBNZWRpYUtleXM7XG4gICAgLy8gV2UgYWx3YXlzIG5lZWQgdG8gdHJ5IGFuZCBpbml0IE1lZGlhS2V5cy4gSWYgdGhlcmUgaXMgYW4gZXJyb3IsIHRoZW4gcmVwb3J0IGl0IHdoZW4gcGxheWVyIHRyaWVzIHRvIGdldCBhIGxpY2Vuc2UuIE90aGVyd2lzZSwgYXNzdW1lIEVNRSBpcyBub3QgbmVlZGVkXG4gICAgcHJpdmF0ZSBfbWVkaWFLZXlzRXJyb3I6IHN0cmluZztcbiAgICBwcml2YXRlIF9rZXlSZXF1ZXN0czogS2V5UmVxdWVzdERhdGFbXTtcbiAgICBwcml2YXRlIF9wZW5kaW5nS2V5UmVxdWVzdHM6IEtleVJlcXVlc3REYXRhW107XG5cbiAgICBwdWJsaWMgcGxheXJlYWR5S2V5U3lzdGVtID0ge1xuICAgICAgICBrZXlTeXN0ZW06ICdjb20ubWljcm9zb2Z0LnBsYXlyZWFkeScsXG4gICAgICAgIHN1cHBvcnRlZENvbmZpZzogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGluaXREYXRhVHlwZXM6IFsna2V5aWRzJywgJ2NlbmMnXSxcbiAgICAgICAgICAgICAgICBhdWRpb0NhcGFiaWxpdGllczpcbiAgICAgICAgICAgICAgICAgICAgW1xuICAgICAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRlbnRUeXBlOiAnYXVkaW8vbXA0OyBjb2RlY3M9XCJtcDRhXCInLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJvYnVzdG5lc3M6ICcnXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgdmlkZW9DYXBhYmlsaXRpZXM6XG4gICAgICAgICAgICAgICAgICAgIFtcbiAgICAgICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb250ZW50VHlwZTogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMVwiJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByb2J1c3RuZXNzOiAnJ1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9XG4gICAgICAgIF1cbiAgICB9O1xuXG4gICAgcHVibGljIHdpZGV2aW5lS2V5U3lzdGVtID0ge1xuICAgICAgICBrZXlTeXN0ZW06ICdjb20ud2lkZXZpbmUuYWxwaGEnLFxuICAgICAgICBzdXBwb3J0ZWRDb25maWc6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBsYWJlbDogJ2ZvbycsXG4gICAgICAgICAgICAgICAgaW5pdERhdGFUeXBlczogWydjZW5jJ10sXG4gICAgICAgICAgICAgICAgc2Vzc2lvblR5cGVzOiBbJ3RlbXBvcmFyeSddLFxuICAgICAgICAgICAgICAgIGF1ZGlvQ2FwYWJpbGl0aWVzOlxuICAgICAgICAgICAgICAgICAgICBbXG4gICAgICAgICAgICAgICAgICAgICAgICB7IGNvbnRlbnRUeXBlOiAnYXVkaW8vbXA0OyBjb2RlY3M9XCJtcDRhLjQwLjVcIicsIHJvYnVzdG5lc3M6ICdTV19TRUNVUkVfQ1JZUFRPJyB9XG4gICAgICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgdmlkZW9DYXBhYmlsaXRpZXM6XG4gICAgICAgICAgICAgICAgICAgIFtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHJvYnVzdG5lc3MgSFdfU0VDVVJFX0FMTCwgSFdfU0VDVVJFX0RFQ09ERSwgSFdfU0VDVVJFX0NSWVBUTywgU1dfU0VDVVJFX0RFQ09ERSwgU1dfU0VDVVJFX0NSWVBUT1xuICAgICAgICAgICAgICAgICAgICAgICAgeyBjb250ZW50VHlwZTogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40ZDAwMWZcIicsIHJvYnVzdG5lc3M6ICdIV19TRUNVUkVfQUxMJyB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgeyBjb250ZW50VHlwZTogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40ZDAwMWZcIicsIHJvYnVzdG5lc3M6ICdIV19TRUNVUkVfREVDT0RFJyB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgeyBjb250ZW50VHlwZTogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40ZDAwMWZcIicsIHJvYnVzdG5lc3M6ICdIV19TRUNVUkVfQ1JZUFRPJyB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgeyBjb250ZW50VHlwZTogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40ZDAwMWZcIicsIHJvYnVzdG5lc3M6ICdTV19TRUNVUkVfREVDT0RFJyB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgeyBjb250ZW50VHlwZTogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40ZDAwMWZcIicsIHJvYnVzdG5lc3M6ICdTV19TRUNVUkVfQ1JZUFRPJyB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgeyBjb250ZW50VHlwZTogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40ZDAwMWVcIicsIHJvYnVzdG5lc3M6ICdIV19TRUNVUkVfQUxMJyB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgeyBjb250ZW50VHlwZTogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40ZDAwMWVcIicsIHJvYnVzdG5lc3M6ICdTV19TRUNVUkVfQ1JZUFRPJyB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgeyBjb250ZW50VHlwZTogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40ZDAwMTZcIicsIHJvYnVzdG5lc3M6ICdIV19TRUNVUkVfQUxMJyB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgeyBjb250ZW50VHlwZTogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40ZDAwMTZcIicsIHJvYnVzdG5lc3M6ICdTV19TRUNVUkVfQ1JZUFRPJyB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgeyBjb250ZW50VHlwZTogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40MjAwMGRcIicsIHJvYnVzdG5lc3M6ICdIV19TRUNVUkVfQUxMJyB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgeyBjb250ZW50VHlwZTogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40MjAwMGRcIicsIHJvYnVzdG5lc3M6ICdTV19TRUNVUkVfQ1JZUFRPJyB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgeyBjb250ZW50VHlwZTogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40MjAwMGNcIicsIHJvYnVzdG5lc3M6ICdIV19TRUNVUkVfQUxMJyB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgeyBjb250ZW50VHlwZTogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40MjAwMGNcIicsIHJvYnVzdG5lc3M6ICdTV19TRUNVUkVfQ1JZUFRPJyB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgeyBjb250ZW50VHlwZTogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40MjAwMGJcIicsIHJvYnVzdG5lc3M6ICdIV19TRUNVUkVfQUxMJyB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgeyBjb250ZW50VHlwZTogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40MjAwMGJcIicsIHJvYnVzdG5lc3M6ICdTV19TRUNVUkVfQ1JZUFRPJyB9LFxuICAgICAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9XG4gICAgICAgIF1cbiAgICB9O1xuXG4gICAgY29uc3RydWN0b3IodmlkZW86IEhUTUxWaWRlb0VsZW1lbnQsIGFkYXB0aXZlU291cmNlOiBNb2R1bGUuQWRhcHRpdmVTb3VyY2UpIHtcbiAgICAgICAgLy8gICAgY29uc29sZS5sb2coJ0xpY2Vuc2VNYW5hZ2VyIENUT1InKTtcbiAgICAgICAgdGhpcy5fdmlkZW8gPSB2aWRlbztcbiAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2UgPSBhZGFwdGl2ZVNvdXJjZTtcbiAgICAgICAgdGhpcy5fa2V5U2VydmVyUHJlZml4ID0gbnVsbDtcbiAgICAgICAgdGhpcy5fcHNzaCA9IG51bGw7XG4gICAgICAgIHRoaXMuX21lZGlhS2V5cyA9IG51bGw7XG4gICAgICAgIHRoaXMuX21lZGlhS2V5c0Vycm9yID0gbnVsbDtcbiAgICAgICAgdGhpcy5fa2V5UmVxdWVzdHMgPSBbXTtcbiAgICAgICAgdGhpcy5fcGVuZGluZ0tleVJlcXVlc3RzID0gW107XG4gICAgICAgIHRoaXMuaW5pdE1lZGlhS2V5cygpO1xuICAgIH1cblxuICAgIHB1YmxpYyBhZGRMaWNlbnNlUmVxdWVzdChkcm1JbmZvOiBLZXlSZXF1ZXN0RGF0YSkge1xuICAgICAgICAvLyAgICBjb25zb2xlLmxvZygnW0xpY2Vuc2VNYW5hZ2VyXSAgR290IGxpY2Vuc2UgcmVxdWVzdCBmb3IgRFJNIHBsYXliYWNrICVvJywgZHJtSW5mbyk7XG5cbiAgICAgICAgLy8gY2hlY2sgaWYgYWxyZWFkeSByZXF1ZXN0ZWRcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9rZXlSZXF1ZXN0cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgaWYgKGRybUluZm8ud2lkZXZpbmUgPT09IHRoaXMuX2tleVJlcXVlc3RzW2ldLndpZGV2aW5lKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vIGNoZWNrIGlmIGFscmVhZHkgcGVuZGluZ1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX3BlbmRpbmdLZXlSZXF1ZXN0cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgaWYgKGRybUluZm8ud2lkZXZpbmUgPT09IHRoaXMuX3BlbmRpbmdLZXlSZXF1ZXN0c1tpXS53aWRldmluZSkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGVsc2UsIHJlcXVlc3QgaXRcbiAgICAgICAgdGhpcy5fcGVuZGluZ0tleVJlcXVlc3RzLnB1c2goZHJtSW5mbyk7XG4gICAgICAgIHRoaXMucHJvY2Vzc1BlbmRpbmdLZXlzKHRoaXMpO1xuICAgIH1cblxuICAgIHB1YmxpYyBzZXRLZXlTZXJ2ZXJQcmVmaXgoa2V5U2VydmVyUHJlZml4OiBzdHJpbmcpIHtcbiAgICAgICAgLy8gICAgY29uc29sZS5sb2coJ0tleVNlcnZlclByZWZpeDogJyArIGtleVNlcnZlclByZWZpeCk7XG4gICAgICAgIHRoaXMuX2tleVNlcnZlclByZWZpeCA9IGtleVNlcnZlclByZWZpeDtcbiAgICB9XG5cbiAgICBwcml2YXRlIGluaXRNZWRpYUtleXMoKSB7XG4gICAgICAgIC8vICAgIGNvbnNvbGUubG9nKCdbaW5pdE1lZGlhS2V5c10nKTtcbiAgICAgICAgbGV0IHNlbGYgPSB0aGlzO1xuICAgICAgICB0aGlzLl9tZWRpYUtleXMgPSBudWxsO1xuXG4gICAgICAgIGlmICghbmF2aWdhdG9yLnJlcXVlc3RNZWRpYUtleVN5c3RlbUFjY2Vzcykge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgbmF2aWdhdG9yLnJlcXVlc3RNZWRpYUtleVN5c3RlbUFjY2VzcyhzZWxmLndpZGV2aW5lS2V5U3lzdGVtLmtleVN5c3RlbSwgc2VsZi53aWRldmluZUtleVN5c3RlbS5zdXBwb3J0ZWRDb25maWcpXG4gICAgICAgICAgICAudGhlbihmdW5jdGlvbiAoa2V5U3lzdGVtQWNjZXNzKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fbGljZW5zZVR5cGUgPSBzZWxmLkxJQ0VOU0VfVFlQRV9XSURFVklORTtcbiAgICAgICAgICAgICAgICBrZXlTeXN0ZW1BY2Nlc3MuY3JlYXRlTWVkaWFLZXlzKClcbiAgICAgICAgICAgICAgICAgICAgLnRoZW4oZnVuY3Rpb24gKGNyZWF0ZWRNZWRpYUtleXMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYub25NZWRpYUtleUFjcXVpcmVkKHNlbGYsIGNyZWF0ZWRNZWRpYUtleXMpO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBuYXZpZ2F0b3IucmVxdWVzdE1lZGlhS2V5U3lzdGVtQWNjZXNzKHNlbGYucGxheXJlYWR5S2V5U3lzdGVtLmtleVN5c3RlbSwgc2VsZi5wbGF5cmVhZHlLZXlTeXN0ZW0uc3VwcG9ydGVkQ29uZmlnKVxuICAgICAgICAgICAgICAgICAgICAudGhlbihmdW5jdGlvbiAoa2V5U3lzdGVtQWNjZXNzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxmLl9saWNlbnNlVHlwZSA9IHNlbGYuTElDRU5TRV9UWVBFX1BMQVlSRUFEWTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGtleVN5c3RlbUFjY2Vzcy5jcmVhdGVNZWRpYUtleXMoKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC50aGVuKGZ1bmN0aW9uIChjcmVhdGVkTWVkaWFLZXlzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYub25NZWRpYUtleUFjcXVpcmVkKHNlbGYsIGNyZWF0ZWRNZWRpYUtleXMpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICAuY2F0Y2goZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5fbWVkaWFLZXlzRXJyb3IgPSAnW0xpY2Vuc2VNYW5hZ2VyXSBZb3VyIGJyb3dzZXIvc3lzdGVtIGRvZXMgbm90IHN1cHBvcnQgdGhlIHJlcXVlc3RlZCBjb25maWd1cmF0aW9ucyBmb3IgcGxheWluZyBwcm90ZWN0ZWQgY29udGVudC4nO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAuY2F0Y2goZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICAgIHNlbGYuX21lZGlhS2V5c0Vycm9yID0gJ1tMaWNlbnNlTWFuYWdlcl0gWW91ciBicm93c2VyL3N5c3RlbSBkb2VzIG5vdCBzdXBwb3J0IHRoZSByZXF1ZXN0ZWQgY29uZmlndXJhdGlvbnMgZm9yIHBsYXlpbmcgcHJvdGVjdGVkIGNvbnRlbnQuJztcbiAgICAgICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgb25NZWRpYUtleUFjcXVpcmVkKHNlbGY6IExpY2Vuc2VNYW5hZ2VyLCBjcmVhdGVkTWVkaWFLZXlzOiBNZWRpYUtleXMpIHtcbiAgICAgICAgLy8gICAgY29uc29sZS5sb2coJ1tvbk1lZGlhS2V5QWNxdWlyZWRdJyk7XG5cbiAgICAgICAgc2VsZi5fbWVkaWFLZXlzID0gY3JlYXRlZE1lZGlhS2V5cztcbiAgICAgICAgc2VsZi5fdmlkZW8uc2V0TWVkaWFLZXlzKHNlbGYuX21lZGlhS2V5cyk7XG4gICAgICAgIHNlbGYucHJvY2Vzc1BlbmRpbmdLZXlzKHNlbGYpO1xuICAgIH1cblxuICAgIHByaXZhdGUgcHJvY2Vzc1BlbmRpbmdLZXlzKHNlbGY6IExpY2Vuc2VNYW5hZ2VyKSB7XG4gICAgICAgIC8vICAgIGNvbnNvbGUubG9nKCdbcHJvY2Vzc1BlbmRpbmdLZXlzXScpO1xuXG4gICAgICAgIC8vIG1lZGlhS2V5cyBtYXkgbm90IGJlIGF2YWlsYWJsZSB5ZXRcbiAgICAgICAgaWYgKHNlbGYuX21lZGlhS2V5cyA9PT0gbnVsbCAmJiBzZWxmLl9tZWRpYUtleXNFcnJvciA9PT0gbnVsbCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHNlbGYuX21lZGlhS2V5cyA9PT0gbnVsbCAmJiBzZWxmLl9tZWRpYUtleXNFcnJvciAhPT0gbnVsbCkge1xuICAgICAgICAgICAgc2VsZi5fYWRhcHRpdmVTb3VyY2Uuc2lnbmFsRHJtRXJyb3Ioc2VsZi5fbWVkaWFLZXlzRXJyb3IpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgd2hpbGUgKHNlbGYuX3BlbmRpbmdLZXlSZXF1ZXN0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBsZXQgZHJtSXRlbSA9IHNlbGYuX3BlbmRpbmdLZXlSZXF1ZXN0cy5zaGlmdCgpOyAvLyBwb3AgZmlyc3QgZWxlbWVudFxuICAgICAgICAgICAgdGhpcy5fa2V5UmVxdWVzdHMucHVzaChkcm1JdGVtKTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdbTGljZW5zZU1hbmFnZXJdIHN0YXJ0aW5nIGxpY2Vuc2UgdXBkYXRlIGZvciBEUk0gcGxheWJhY2snKTtcbiAgICAgICAgICAgIGlmIChzZWxmLl9saWNlbnNlVHlwZSA9PT0gdGhpcy5MSUNFTlNFX1RZUEVfV0lERVZJTkUpIHtcbiAgICAgICAgICAgICAgICBzZWxmLmdldE5ld0tleVNlc3Npb24odXRpbHMuYmFzZTY0VG9CdWZmZXIoZHJtSXRlbS53aWRldmluZSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoc2VsZi5fbGljZW5zZVR5cGUgPT09IHRoaXMuTElDRU5TRV9UWVBFX1BMQVlSRUFEWSkge1xuICAgICAgICAgICAgICAgIHNlbGYuZ2V0TmV3S2V5U2Vzc2lvbih1dGlscy5iYXNlNjRUb0J1ZmZlcihkcm1JdGVtLnBsYXlyZWFkeSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBnZXROZXdLZXlTZXNzaW9uKGluaXREYXRhOiBVaW50OEFycmF5KSB7XG4gICAgICAgIC8vICAgIGNvbnNvbGUubG9nKCdbZ2V0TmV3S2V5U2Vzc2lvbl0nKTtcblxuICAgICAgICBsZXQgc2VsZiA9IHRoaXM7XG4gICAgICAgIGxldCBrZXlTZXNzaW9uID0gc2VsZi5fbWVkaWFLZXlzLmNyZWF0ZVNlc3Npb24oJ3RlbXBvcmFyeScpO1xuICAgICAgICBrZXlTZXNzaW9uLmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCBmdW5jdGlvbiAoZXZlbnQ6IE1lZGlhS2V5TWVzc2FnZUV2ZW50KSB7XG4gICAgICAgICAgICAvL2NvbnNvbGUubG9nKCdvbm1lc3NhZ2UgLCBtZXNzYWdlIHR5cGU6ICcgKyBldmVudC5tZXNzYWdlVHlwZSk7XG5cbiAgICAgICAgICAgIHNlbGYuZG93bmxvYWROZXdLZXkoc2VsZi5nZXRMaWNlbnNlVXJsKCksIGV2ZW50Lm1lc3NhZ2UsIGZ1bmN0aW9uIChkYXRhOiBBcnJheUJ1ZmZlcikge1xuXG4gICAgICAgICAgICAgICAgLy8gY29uc29sZS5sb2coJ2V2ZW50LnRhcmdldC51cGRhdGUsIGRhdGEgYnl0ZXM6ICcgKyBkYXRhLmJ5dGVMZW5ndGgpO1xuXG4gICAgICAgICAgICAgICAgdmFyIHByb20gPSA8UHJvbWlzZTx2b2lkPj4oPE1lZGlhS2V5U2Vzc2lvbj5ldmVudC50YXJnZXQpLnVwZGF0ZShkYXRhKTtcbiAgICAgICAgICAgICAgICBwcm9tLmNhdGNoKGZ1bmN0aW9uIChlOiBzdHJpbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgc2VsZi5fYWRhcHRpdmVTb3VyY2Uuc2lnbmFsRHJtRXJyb3IoJ1tMaWNlbnNlTWFuYWdlcl0gY2FsbCB0byBNZWRpYUtleVNlc3Npb24udXBkYXRlKCkgZmFpbGVkOiAnICsgZSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ1tMaWNlbnNlTWFuYWdlcl0gZmluaXNoZWQgbGljZW5zZSB1cGRhdGUgZm9yIERSTSBwbGF5YmFjaycpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0sIGZhbHNlKTtcblxuICAgICAgICBsZXQgcmVxUHJvbWlzZSA9IDxQcm9taXNlPHZvaWQ+PmtleVNlc3Npb24uZ2VuZXJhdGVSZXF1ZXN0KCdjZW5jJywgaW5pdERhdGEpO1xuICAgICAgICByZXFQcm9taXNlLmNhdGNoKGZ1bmN0aW9uIChlOiBzdHJpbmcpIHtcbiAgICAgICAgICAgIHNlbGYuX2FkYXB0aXZlU291cmNlLnNpZ25hbERybUVycm9yKCdbTGljZW5zZU1hbmFnZXJdIGtleVNlc3Npb24uZ2VuZXJhdGVSZXF1ZXN0KCkgZmFpbGVkOiAnICsgZSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgZ2V0TGljZW5zZVVybCgpIHtcbiAgICAgICAgaWYgKHRoaXMuX2xpY2Vuc2VUeXBlID09PSB0aGlzLkxJQ0VOU0VfVFlQRV9QTEFZUkVBRFkpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9rZXlTZXJ2ZXJQcmVmaXggKyAnL3ByJztcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICh0aGlzLl9saWNlbnNlVHlwZSA9PT0gdGhpcy5MSUNFTlNFX1RZUEVfV0lERVZJTkUpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9rZXlTZXJ2ZXJQcmVmaXggKyAnL3d2JztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gJyc7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBkb3dubG9hZE5ld0tleSh1cmw6IHN0cmluZywga2V5TWVzc2FnZTogQXJyYXlCdWZmZXIsIGNhbGxiYWNrOiBhbnkpIHtcbiAgICAgICAgLy8gICAgY29uc29sZS5sb2coJ2Rvd25sb2FkTmV3S2V5ICh4aHIpOiAnICsgdXJsKTtcblxuICAgICAgICBsZXQgc2VsZiA9IHRoaXM7XG5cbiAgICAgICAgbGV0IGNoYWxsZW5nZTogQXJyYXlCdWZmZXI7XG4gICAgICAgIGxldCB4aHIgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcbiAgICAgICAgeGhyLm9wZW4oJ1BPU1QnLCB1cmwsIHRydWUpO1xuICAgICAgICB4aHIud2l0aENyZWRlbnRpYWxzID0gZmFsc2U7XG4gICAgICAgIHhoci5yZXNwb25zZVR5cGUgPSAnYXJyYXlidWZmZXInO1xuICAgICAgICB4aHIub25yZWFkeXN0YXRlY2hhbmdlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKHhoci5yZWFkeVN0YXRlID09PSA0KSB7XG4gICAgICAgICAgICAgICAgaWYgKHhoci5zdGF0dXMgPT09IDIwMCkge1xuICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayh4aHIucmVzcG9uc2UpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYuX2FkYXB0aXZlU291cmNlLnNpZ25hbERybUVycm9yKCdbTGljZW5zZU1hbmFnZXJdIFhIUiBmYWlsZWQgKCcgKyB1cmwgKyAnKS4gU3RhdHVzOiAnICsgeGhyLnN0YXR1cyArICcgKCcgKyB4aHIuc3RhdHVzVGV4dCArICcpJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICBpZiAodGhpcy5fbGljZW5zZVR5cGUgPT09IHRoaXMuTElDRU5TRV9UWVBFX1BMQVlSRUFEWSkge1xuICAgICAgICAgICAgLy8gRm9yIFBsYXlSZWFkeSBDRE1zLCB3ZSBuZWVkIHRvIGRpZyB0aGUgQ2hhbGxlbmdlIG91dCBvZiB0aGUgWE1MLlxuICAgICAgICAgICAgdmFyIGtleU1lc3NhZ2VYbWwgPSBuZXcgRE9NUGFyc2VyKCkucGFyc2VGcm9tU3RyaW5nKFN0cmluZy5mcm9tQ2hhckNvZGUuYXBwbHkobnVsbCwgbmV3IFVpbnQxNkFycmF5KGtleU1lc3NhZ2UpKSwgJ2FwcGxpY2F0aW9uL3htbCcpO1xuICAgICAgICAgICAgaWYgKGtleU1lc3NhZ2VYbWwuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ0NoYWxsZW5nZScpWzBdKSB7XG4gICAgICAgICAgICAgICAgY2hhbGxlbmdlID0gdXRpbHMuYmFzZTY0VG9CdWZmZXIoa2V5TWVzc2FnZVhtbC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnQ2hhbGxlbmdlJylbMF0uY2hpbGROb2Rlc1swXS5ub2RlVmFsdWUpLmJ1ZmZlcjtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgc2VsZi5fYWRhcHRpdmVTb3VyY2Uuc2lnbmFsRHJtRXJyb3IoJ0Nhbm5vdCBmaW5kIDxDaGFsbGVuZ2U+IGluIGtleSBtZXNzYWdlJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB2YXIgaGVhZGVyTmFtZXMgPSBrZXlNZXNzYWdlWG1sLmdldEVsZW1lbnRzQnlUYWdOYW1lKCduYW1lJyk7XG4gICAgICAgICAgICB2YXIgaGVhZGVyVmFsdWVzID0ga2V5TWVzc2FnZVhtbC5nZXRFbGVtZW50c0J5VGFnTmFtZSgndmFsdWUnKTtcbiAgICAgICAgICAgIGlmIChoZWFkZXJOYW1lcy5sZW5ndGggIT09IGhlYWRlclZhbHVlcy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICBzZWxmLl9hZGFwdGl2ZVNvdXJjZS5zaWduYWxEcm1FcnJvcignTWlzbWF0Y2hlZCBoZWFkZXIgPG5hbWU+Lzx2YWx1ZT4gcGFpciBpbiBrZXkgbWVzc2FnZScpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBoZWFkZXJOYW1lcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIHhoci5zZXRSZXF1ZXN0SGVhZGVyKGhlYWRlck5hbWVzW2ldLmNoaWxkTm9kZXNbMF0ubm9kZVZhbHVlLCBoZWFkZXJWYWx1ZXNbaV0uY2hpbGROb2Rlc1swXS5ub2RlVmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHRoaXMuX2xpY2Vuc2VUeXBlID09PSB0aGlzLkxJQ0VOU0VfVFlQRV9XSURFVklORSkge1xuICAgICAgICAgICAgLy8gRm9yIFdpZGV2aW5lIENETXMsIHRoZSBjaGFsbGVuZ2UgaXMgdGhlIGtleU1lc3NhZ2UuXG4gICAgICAgICAgICBjaGFsbGVuZ2UgPSBrZXlNZXNzYWdlO1xuICAgICAgICB9XG5cbiAgICAgICAgeGhyLnNlbmQoY2hhbGxlbmdlKTtcbiAgICB9XG59XG4iLCJpbXBvcnQgeyBPYnNlcnZhYmxlIH0gZnJvbSAnLi91dGlscy9vYnNlcnZhYmxlJztcbmltcG9ydCB7IEV2ZW50cyB9IGZyb20gJy4vZXZlbnRzJztcbmltcG9ydCB7IFBsYXllciwgUmVzb2x1dGlvbiwgTWltZVR5cGUgfSBmcm9tICcuL3BsYXllcic7XG5pbXBvcnQgKiBhcyB0aHVtYiBmcm9tICcuL3V0aWxzL3RodW1ibmFpbC1oZWxwZXInO1xuaW1wb3J0IHsgU2VnbWVudE1hcCB9IGZyb20gJy4vdXRpbHMvc2VnbWVudC1tYXAnO1xuaW1wb3J0IHsgQWRCcmVhayB9IGZyb20gJy4vYWQvYWQtYnJlYWsnO1xuaW1wb3J0IHsgSUQzSGFuZGxlciwgSUQzVGFnRXZlbnQsIFR4eHhJRDNGcmFtZUV2ZW50LCBQcml2SUQzRnJhbWVFdmVudCwgVGV4dElEM0ZyYW1lRXZlbnQsIFNsaWNlRXZlbnQgfSBmcm9tICcuL2lkMy9pZDMtaGFuZGxlcic7XG5pbXBvcnQgeyBJRDNEYXRhIH0gZnJvbSAnLi9pZDMvaWQzLWRhdGEnO1xuaW1wb3J0IHsgQXNzZXRJbmZvLCBBc3NldEluZm9TZXJ2aWNlIH0gZnJvbSAnLi93ZWItc2VydmljZXMvYXNzZXQtaW5mby1zZXJ2aWNlJztcbmltcG9ydCB7IFBpbmdTZXJ2aWNlIH0gZnJvbSAnLi93ZWItc2VydmljZXMvcGluZy1zZXJ2aWNlJztcbmltcG9ydCB7IGdldFByb3RvY29sIH0gZnJvbSAnLi91dGlscy91dGlscyc7XG5pbXBvcnQgeyBMaWNlbnNlTWFuYWdlckZQIH0gZnJvbSAnLi9saWNlbnNlLW1hbmFnZXItZnAnO1xuXG5leHBvcnQgY2xhc3MgTmF0aXZlUGxheWVyIGV4dGVuZHMgT2JzZXJ2YWJsZSBpbXBsZW1lbnRzIFBsYXllciB7XG4gICAgcHJpdmF0ZSBfdmlkZW86IEhUTUxWaWRlb0VsZW1lbnQ7XG4gICAgcHJpdmF0ZSBfdXJsOiBzdHJpbmc7XG4gICAgcHJpdmF0ZSBfcGxheWxpc3RUeXBlOiBcIlZPRFwiIHwgXCJFVkVOVFwiIHwgXCJMSVZFXCI7XG4gICAgcHJpdmF0ZSBfaWQzSGFuZGxlcjogSUQzSGFuZGxlcjtcbiAgICBwcml2YXRlIF9maXJlZFJlYWR5RXZlbnQ6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSBfYXNzZXRJbmZvU2VydmljZTogQXNzZXRJbmZvU2VydmljZTtcbiAgICBwcml2YXRlIF9waW5nU2VydmljZTogUGluZ1NlcnZpY2U7XG4gICAgcHJpdmF0ZSBfc2Vzc2lvbklkOiBzdHJpbmc7XG4gICAgcHJpdmF0ZSBfZG9tYWluOiBzdHJpbmc7XG4gICAgcHJpdmF0ZSBfY3VycmVudEFzc2V0SWQ6IHN0cmluZztcbiAgICBwcml2YXRlIF9jb25maWc6IFBsYXllck9wdGlvbnM7XG4gICAgcHJpdmF0ZSBfaW5BZEJyZWFrOiBib29sZWFuO1xuICAgIHByaXZhdGUgX2N1cnJlbnRBZEJyZWFrOiBBZEJyZWFrO1xuICAgIHByaXZhdGUgX3Byb3RvY29sOiBzdHJpbmc7XG4gICAgcHJpdmF0ZSBfbGljZW5zZU1hbmFnZXJGUDogTGljZW5zZU1hbmFnZXJGUDtcblxuICAgIC8vZG8gbm90aGluZyBwcm9wZXJ0aWVzXG4gICAgcmVhZG9ubHkgbnVtYmVyT2ZSYXlzOiBudW1iZXI7XG4gICAgcmVhZG9ubHkgYXZhaWxhYmxlQmFuZHdpZHRoczogbnVtYmVyW107XG4gICAgcmVhZG9ubHkgYXZhaWxhYmxlUmVzb2x1dGlvbnM6IFJlc29sdXRpb25bXTtcbiAgICByZWFkb25seSBhdmFpbGFibGVNaW1lVHlwZXM6IE1pbWVUeXBlW107XG4gICAgcmVhZG9ubHkgc2VnbWVudE1hcDogU2VnbWVudE1hcDtcbiAgICByZWFkb25seSBhZEJyZWFrczogQWRCcmVha1tdO1xuICAgIHJlYWRvbmx5IGlzQXVkaW9Pbmx5OiBib29sZWFuO1xuXG4gICAgcHJpdmF0ZSByZWFkb25seSBfZGVmYXVsdHM6IFBsYXllck9wdGlvbnMgPSB7XG4gICAgICAgIGRpc2FibGVTZWVrRHVyaW5nQWRCcmVhazogdHJ1ZSxcbiAgICAgICAgc2hvd1Bvc3RlcjogZmFsc2UsXG4gICAgICAgIGRlYnVnOiBmYWxzZVxuICAgIH07XG5cbiAgICBjb25zdHJ1Y3Rvcih2aWRlbzogSFRNTFZpZGVvRWxlbWVudCwgb3B0aW9ucz86IFBsYXllck9wdGlvbnMpIHtcbiAgICAgICAgc3VwZXIoKTtcblxuICAgICAgICAvL2luaXQgY29uZmlnXG4gICAgICAgIHZhciBkYXRhID0ge307XG5cbiAgICAgICAgLy90cnkgcGFyc2luZyBkYXRhIGF0dHJpYnV0ZSBjb25maWdcbiAgICAgICAgdHJ5IHsgZGF0YSA9IEpTT04ucGFyc2UodmlkZW8uZ2V0QXR0cmlidXRlKCdkYXRhLWNvbmZpZycpKTsgfVxuICAgICAgICBjYXRjaCAoZSkgeyB9XG5cbiAgICAgICAgLy9tZXJnZSBkZWZhdWx0cyB3aXRoIHVzZXIgb3B0aW9uc1xuICAgICAgICB0aGlzLl9jb25maWcgPSBPYmplY3QuYXNzaWduKHt9LCB0aGlzLl9kZWZhdWx0cywgb3B0aW9ucywgZGF0YSk7XG5cbiAgICAgICAgdGhpcy5fdmlkZW8gPSB2aWRlbztcbiAgICAgICAgdGhpcy5faWQzSGFuZGxlciA9IG5ldyBJRDNIYW5kbGVyKHZpZGVvKTtcbiAgICAgICAgdGhpcy5faWQzSGFuZGxlci5vbihJRDNIYW5kbGVyLkV2ZW50LklEM1RhZywgdGhpcy5fb25JRDNUYWcuYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuX2lkM0hhbmRsZXIub24oSUQzSGFuZGxlci5FdmVudC5UeHh4SUQzRnJhbWUsIHRoaXMuX29uVHh4eElEM0ZyYW1lLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLl9pZDNIYW5kbGVyLm9uKElEM0hhbmRsZXIuRXZlbnQuUHJpdklEM0ZyYW1lLCB0aGlzLl9vblByaXZJRDNGcmFtZS5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5faWQzSGFuZGxlci5vbihJRDNIYW5kbGVyLkV2ZW50LlRleHRJRDNGcmFtZSwgdGhpcy5fb25UZXh0SUQzRnJhbWUuYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuX2lkM0hhbmRsZXIub24oSUQzSGFuZGxlci5FdmVudC5TbGljZUVudGVyZWQsIHRoaXMuX29uU2xpY2VFbnRlcmVkLmJpbmQodGhpcykpO1xuXG4gICAgICAgIHRoaXMuX29uRHVyYXRpb25DaGFuZ2UgPSB0aGlzLl9vbkR1cmF0aW9uQ2hhbmdlLmJpbmQodGhpcyk7XG5cbiAgICAgICAgdGhpcy5fb3ZlcnJpZGVDdXJyZW50VGltZSgpO1xuICAgIH1cblxuICAgIHByaXZhdGUgcHJlcGFyZUxvYWQodXJsOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5fcHJvdG9jb2wgPSBnZXRQcm90b2NvbCh1cmwpO1xuXG4gICAgICAgIHRoaXMuX2ZpcmVkUmVhZHlFdmVudCA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9jdXJyZW50QXNzZXRJZCA9IG51bGw7XG5cbiAgICAgICAgdGhpcy5fdmlkZW8ucmVtb3ZlRXZlbnRMaXN0ZW5lcignZHVyYXRpb25jaGFuZ2UnLCB0aGlzLl9vbkR1cmF0aW9uQ2hhbmdlKTtcbiAgICAgICAgdGhpcy5fdmlkZW8uYWRkRXZlbnRMaXN0ZW5lcignZHVyYXRpb25jaGFuZ2UnLCB0aGlzLl9vbkR1cmF0aW9uQ2hhbmdlKTtcbiAgICAgICAgaWYgKHRoaXMuX3ZpZGVvLmF1ZGlvVHJhY2tzKSB7IC8vIFVQTFlOSyBVUC04NTgxXG4gICAgICAgICAgICB0aGlzLl92aWRlby5hdWRpb1RyYWNrcy5hZGRFdmVudExpc3RlbmVyKCdhZGR0cmFjaycsIHRoaXMuX29uQXVkaW9UcmFja0FkZGVkLmJpbmQodGhpcykpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy9zZXNzaW9uSWQgKD9wYnM9KSBtYXkgb3IgbWF5IG5vdCBiZSBwYXJ0IG9mIHRoZSB1cmxcbiAgICAgICAgdGhpcy5fc2Vzc2lvbklkID0gdGhpcy5fZ2V0U2Vzc2lvbklkKHVybCk7XG4gICAgICAgIHRoaXMuX2RvbWFpbiA9IHRoaXMuX2dldERvbWFpbih1cmwpO1xuXG4gICAgICAgIHRoaXMuX2xpY2Vuc2VNYW5hZ2VyRlAgPSBuZXcgTGljZW5zZU1hbmFnZXJGUCh0aGlzLl92aWRlbyk7XG5cbiAgICAgICAgaWYgKHRoaXMuX2lzVXBseW5rVXJsKHVybCkpIHtcbiAgICAgICAgICAgIHRoaXMuX2Fzc2V0SW5mb1NlcnZpY2UgPSBuZXcgQXNzZXRJbmZvU2VydmljZSh0aGlzLl9wcm90b2NvbCwgdGhpcy5kb21haW4pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy9jYW4ndCB1c2UgJ2NvbnRlbnQudXBseW5rLmNvbScgYXMgYSBkb21haW4gbmFtZSBiZWNhdXNlIHNlc3Npb24gZGF0YSBsaXZlc1xuICAgICAgICAvLyBpbnNpZGUgYSBzcGVjaWZpYyBkb21haW5cbiAgICAgICAgaWYgKHRoaXMuX2RvbWFpbiAhPT0gJ2NvbnRlbnQudXBseW5rLmNvbScpIHtcbiAgICAgICAgICAgIHRoaXMuX3BpbmdTZXJ2aWNlID0gbmV3IFBpbmdTZXJ2aWNlKHRoaXMuX3Byb3RvY29sLCB0aGlzLmRvbWFpbiwgdGhpcy5fc2Vzc2lvbklkLCB0aGlzLl92aWRlbyk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl91cmwgPSB1cmw7XG4gICAgICAgIHRoaXMuX3ZpZGVvLnNyYyA9IHVybDtcbiAgICB9XG5cbiAgICBwdWJsaWMgbG9hZChpbmZvOiBzdHJpbmcgfCBMb2FkQ29uZmlnKTogdm9pZCB7XG4gICAgICAgIGxldCB1cmw6IHN0cmluZyA9IG51bGw7XG4gICAgICAgIGxldCBmYWlycGxheUNlcnRQYXRoOiBzdHJpbmcgPSBudWxsO1xuXG4gICAgICAgIGlmICh0eXBlb2YgaW5mbyA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgdXJsID0gaW5mbyBhcyBzdHJpbmc7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB1cmwgPSAoaW5mbyBhcyBMb2FkQ29uZmlnKS51cmw7XG4gICAgICAgICAgICBpZiAoKGluZm8gYXMgTG9hZENvbmZpZykuZmFpcnBsYXlDZXJ0aWZpY2F0ZVBhdGggIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIGZhaXJwbGF5Q2VydFBhdGggPSAoaW5mbyBhcyBMb2FkQ29uZmlnKS5mYWlycGxheUNlcnRpZmljYXRlUGF0aDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMucHJlcGFyZUxvYWQodXJsKTtcblxuICAgICAgICBpZiAoZmFpcnBsYXlDZXJ0UGF0aCkge1xuICAgICAgICAgICAgLy8gTG9hZCBGYWlycGxheVxuICAgICAgICAgICAgY29uc29sZS5sb2coXCJMb2FkaW5nIHdpdGggRmFpcnBsYXlcIik7XG4gICAgICAgICAgICB0aGlzLl9saWNlbnNlTWFuYWdlckZQLmxvYWQoZmFpcnBsYXlDZXJ0UGF0aCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLl92aWRlby5sb2FkKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgZGVzdHJveSgpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5fdmlkZW8uc3JjID0gbnVsbDtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vdmVycmlkZUN1cnJlbnRUaW1lKCk6IHZvaWQge1xuICAgICAgICAvL292ZXJyaWRlICdjdXJyZW50VGltZScgcHJvcGVydHkgc28gd2UgY2FuIHByZXZlbnRcbiAgICAgICAgLy8gdXNlcnMgZnJvbSBzZXR0aW5nIHZpZGVvLmN1cnJlbnRUaW1lLCBhbGxvd2luZyB0aGVtXG4gICAgICAgIC8vIHRvIHNraXAgYWRzLlxuICAgICAgICBjb25zdCBjdXJyZW50VGltZURlc2NyaXB0b3IgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKEhUTUxNZWRpYUVsZW1lbnQucHJvdG90eXBlLCAnY3VycmVudFRpbWUnKTtcbiAgICAgICAgaWYgKGN1cnJlbnRUaW1lRGVzY3JpcHRvcikge1xuICAgICAgICAgICAgY29uc3QgZ2V0Q3VycmVudFRpbWUgPSBjdXJyZW50VGltZURlc2NyaXB0b3IuZ2V0O1xuICAgICAgICAgICAgY29uc3Qgc2V0Q3VycmVudFRpbWUgPSBjdXJyZW50VGltZURlc2NyaXB0b3Iuc2V0O1xuXG4gICAgICAgICAgICBsZXQgc2VsZiA9IHRoaXM7XG5cbiAgICAgICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0aGlzLl92aWRlbywgJ2N1cnJlbnRUaW1lJywge1xuICAgICAgICAgICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZ2V0Q3VycmVudFRpbWUuYXBwbHkodGhpcyk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBzZXQ6IGZ1bmN0aW9uICh2YWwpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHNlbGYuY2FuU2VlaygpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZXRDdXJyZW50VGltZS5hcHBseSh0aGlzLCBbdmFsXSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIGVudW1lcmFibGU6IGZhbHNlLFxuICAgICAgICAgICAgICAgIGNvbmZpZ3VyYWJsZTogZmFsc2UsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIERldGVybWluZXMgaWYgdGhlIHBsYXllciBjYW4gc2VlayBnaXZlbiBpdCdzIGN1cnJlbnQgcG9zaXRpb24gYW5kXG4gICAgICogd2V0aGVyIG9yIG5vdCBpdCdzIGluIGFuIGFkIGJyZWFrLlxuICAgICAqIEByZXR1cm4ge2Jvb2xlYW59IFRydWUgaWYgdGhlIHBsYXllciBjYW4gc2Vlaywgb3RoZXJ3aXNlIGZhbHNlLlxuICAgICAqL1xuICAgIGNhblNlZWsoKTogYm9vbGVhbiB7XG4gICAgICAgIGlmICghdGhpcy5fY29uZmlnLmRpc2FibGVTZWVrRHVyaW5nQWRCcmVhaykge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gIXRoaXMuX2luQWRCcmVhaztcbiAgICB9XG5cbiAgICBwcml2YXRlIF9nZXRTZXNzaW9uSWQodXJsOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgICAgICAvL2h0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9hLzUxNTgzMDFcbiAgICAgICAgdmFyIG1hdGNoID0gUmVnRXhwKCdbPyZdcGJzPShbXiZdKiknKS5leGVjKHVybCk7XG4gICAgICAgIHJldHVybiBtYXRjaCAmJiBkZWNvZGVVUklDb21wb25lbnQobWF0Y2hbMV0ucmVwbGFjZSgvXFwrL2csICcgJykpO1xuICAgIH1cblxuICAgIHByaXZhdGUgX2dldERvbWFpbih1cmw6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgICAgIHZhciBsaW5rID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpO1xuICAgICAgICBsaW5rLnNldEF0dHJpYnV0ZSgnaHJlZicsIHVybCk7XG5cbiAgICAgICAgcmV0dXJuIGxpbmsuaG9zdG5hbWU7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfaXNVcGx5bmtVcmwodXJsOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICAgICAgY29uc3QgdGVtcCA9IHVybC50b0xvd2VyQ2FzZSgpO1xuICAgICAgICByZXR1cm4gdGVtcC5pbmRleE9mKCd1cGx5bmsuY29tJykgPiAtMSB8fCB0ZW1wLmluZGV4T2YoJ2Rvd25seW5rLmNvbScpID4gLTE7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25EdXJhdGlvbkNoYW5nZSgpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuX3ZpZGVvLmR1cmF0aW9uID09PSBJbmZpbml0eSkge1xuICAgICAgICAgICAgdGhpcy5fcGxheWxpc3RUeXBlID0gJ0xJVkUnO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5fcGxheWxpc3RUeXBlID0gJ1ZPRCc7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXRoaXMuX2ZpcmVkUmVhZHlFdmVudCkge1xuICAgICAgICAgICAgdGhpcy5fZmlyZWRSZWFkeUV2ZW50ID0gdHJ1ZTtcbiAgICAgICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLlJlYWR5KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHN0YXRpYyBnZXQgRXZlbnQoKSB7XG4gICAgICAgIHJldHVybiBFdmVudHM7XG4gICAgfVxuXG4gICAgcHVibGljIHNldEJyb3dzZXIoc2FmYXJpOiBib29sZWFuLCBpZTogYm9vbGVhbiwgY2hyb21lOiBib29sZWFuLCBmaXJlZm94OiBib29sZWFuKSB7XG4gICAgICAgIC8vZG8gbm90aGluZ1xuICAgIH1cblxuICAgIHB1YmxpYyBnZXRUaHVtYm5haWwodGltZTogbnVtYmVyLCBzaXplOiBcInNtYWxsXCIgfCBcImxhcmdlXCIpOiB0aHVtYi5UaHVtYm5haWwge1xuICAgICAgICAvL2RvIG5vdGhpbmdcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgZ2V0IGF1ZGlvVHJhY2tzKCk6IEF1ZGlvVHJhY2tMaXN0IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3ZpZGVvLmF1ZGlvVHJhY2tzO1xuICAgIH1cblxuICAgIGdldCBhdWRpb1RyYWNrSWQoKTogbnVtYmVyIHtcbiAgICAgICAgbGV0IGN1cnJlbnRUcmFjayA9IHRoaXMuYXVkaW9UcmFjaztcbiAgICAgICAgaWYgKGN1cnJlbnRUcmFjayAhPSBudWxsKSB7XG4gICAgICAgICAgICByZXR1cm4gcGFyc2VJbnQoY3VycmVudFRyYWNrLmlkKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gMDtcblxuICAgIH1cblxuICAgIHNldCBhdWRpb1RyYWNrSWQoaWQ6IG51bWJlcikge1xuICAgICAgICBsZXQgYXVkaW9UcmFja3MgPSB0aGlzLmF1ZGlvVHJhY2tzO1xuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYXVkaW9UcmFja3MubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGlmIChwYXJzZUludChhdWRpb1RyYWNrc1tpXS5pZCkgPT09IGlkKSB7XG4gICAgICAgICAgICAgICAgYXVkaW9UcmFja3NbaV0uZW5hYmxlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0IGF1ZGlvVHJhY2soKTogQXVkaW9UcmFjayB7XG4gICAgICAgIGxldCBhdWRpb1RyYWNrcyA9IHRoaXMuYXVkaW9UcmFja3M7XG5cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhdWRpb1RyYWNrcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgaWYgKGF1ZGlvVHJhY2tzW2ldLmVuYWJsZWQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gYXVkaW9UcmFja3NbaV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBnZXQgZG9tYWluKCk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiB0aGlzLl9kb21haW47XG4gICAgfVxuXG4gICAgZ2V0IHNlc3Npb25JZCgpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdGhpcy5fc2Vzc2lvbklkO1xuICAgIH1cblxuICAgIGdldCBwbGF5bGlzdFR5cGUoKTogXCJWT0RcIiB8IFwiRVZFTlRcIiB8IFwiTElWRVwiIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3BsYXlsaXN0VHlwZTtcbiAgICB9XG5cbiAgICBnZXQgZHVyYXRpb24oKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3ZpZGVvLmR1cmF0aW9uO1xuICAgIH1cblxuICAgIGdldCBzdXBwb3J0c1RodW1ibmFpbHMoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBnZXQgY2xhc3NOYW1lKCk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiAnTmF0aXZlUGxheWVyJztcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vbklEM1RhZyhldmVudDogSUQzVGFnRXZlbnQpOiB2b2lkIHtcbiAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuSUQzVGFnLCBldmVudCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25UeHh4SUQzRnJhbWUoZXZlbnQ6IFR4eHhJRDNGcmFtZUV2ZW50KTogdm9pZCB7XG4gICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLlR4eHhJRDNGcmFtZSwgZXZlbnQpO1xuICAgIH1cblxuICAgIHByaXZhdGUgX29uUHJpdklEM0ZyYW1lKGV2ZW50OiBQcml2SUQzRnJhbWVFdmVudCk6IHZvaWQge1xuICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5Qcml2SUQzRnJhbWUsIGV2ZW50KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vblRleHRJRDNGcmFtZShldmVudDogVGV4dElEM0ZyYW1lRXZlbnQpOiB2b2lkIHtcbiAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuVGV4dElEM0ZyYW1lLCBldmVudCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25BdWRpb1RyYWNrQWRkZWQoZXZlbnQ6IFRyYWNrRXZlbnQpOiB2b2lkIHtcbiAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuQXVkaW9UcmFja0FkZGVkLCBldmVudCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25TbGljZUVudGVyZWQoZXZlbnQ6IFNsaWNlRXZlbnQpOiB2b2lkIHtcbiAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuU2xpY2VFbnRlcmVkLCBldmVudCk7XG5cbiAgICAgICAgaWYgKCF0aGlzLl9hc3NldEluZm9TZXJ2aWNlKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5fY3VycmVudEFzc2V0SWQgPT09IG51bGwpIHtcbiAgICAgICAgICAgIC8vZmlyc3QgYXNzZXQgaWQgZW5jb3VudGVyZWRcbiAgICAgICAgICAgIHRoaXMuX2Fzc2V0SW5mb1NlcnZpY2UubG9hZEFzc2V0SWQoZXZlbnQuYXNzZXRJZCwgbnVsbCwgKGFzc2V0SW5mbzogQXNzZXRJbmZvKSA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy5fY3VycmVudEFzc2V0SWQgPSBldmVudC5hc3NldElkO1xuICAgICAgICAgICAgICAgIHRoaXMuX29uQXNzZXRFbmNvdW50ZXJlZChldmVudC5jdWUsIGFzc2V0SW5mbyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLl9jdXJyZW50QXNzZXRJZCAhPT0gZXZlbnQuYXNzZXRJZCkge1xuICAgICAgICAgICAgdGhpcy5fYXNzZXRJbmZvU2VydmljZS5sb2FkQXNzZXRJZCh0aGlzLl9jdXJyZW50QXNzZXRJZCwgbnVsbCwgKGN1cnJlbnRBc3NldEluZm86IEFzc2V0SW5mbykgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuX2Fzc2V0SW5mb1NlcnZpY2UubG9hZEFzc2V0SWQoZXZlbnQuYXNzZXRJZCwgbnVsbCwgKG5ld0Fzc2V0SW5mbzogQXNzZXRJbmZvKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2N1cnJlbnRBc3NldElkID0gZXZlbnQuYXNzZXRJZDtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fb25OZXdBc3NldEVuY291bnRlcmVkKGV2ZW50LmN1ZSwgY3VycmVudEFzc2V0SW5mbywgbmV3QXNzZXRJbmZvKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy9zYW1lIGFzc2V0IGlkIGFzIHByZXZpb3VzIG9uZSwgZG8gbm90aGluZ1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25Bc3NldEVuY291bnRlcmVkKGN1ZTogVGV4dFRyYWNrQ3VlLCBhc3NldEluZm86IEFzc2V0SW5mbyk6IHZvaWQge1xuICAgICAgICBsZXQgc2VnbWVudDogU2VnbWVudCA9IHVuZGVmaW5lZDtcblxuICAgICAgICBpZiAoYXNzZXRJbmZvLmlzQWQpIHtcbiAgICAgICAgICAgIHNlZ21lbnQgPSB7XG4gICAgICAgICAgICAgICAgaWQ6IGFzc2V0SW5mby5hc3NldCxcbiAgICAgICAgICAgICAgICBpbmRleDogMCxcbiAgICAgICAgICAgICAgICBzdGFydFRpbWU6IGN1ZS5zdGFydFRpbWUsXG4gICAgICAgICAgICAgICAgZW5kVGltZTogY3VlLnN0YXJ0VGltZSArIGFzc2V0SW5mby5kdXJhdGlvbixcbiAgICAgICAgICAgICAgICB0eXBlOiAnQUQnXG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBsZXQgc2VnbWVudHM6IFNlZ21lbnRbXSA9IFtzZWdtZW50XTtcbiAgICAgICAgICAgIHRoaXMuX2N1cnJlbnRBZEJyZWFrID0gbmV3IEFkQnJlYWsoc2VnbWVudHMpO1xuICAgICAgICAgICAgdGhpcy5faW5BZEJyZWFrID0gdHJ1ZTtcblxuICAgICAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuQXNzZXRFbnRlcmVkLCB7IHNlZ21lbnQ6IHNlZ21lbnQsIGFzc2V0OiBhc3NldEluZm8gfSk7XG4gICAgICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5BZEJyZWFrRW50ZXJlZCwgeyBhZEJyZWFrOiB0aGlzLl9jdXJyZW50QWRCcmVhayB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuX2luQWRCcmVhayA9IGZhbHNlO1xuXG4gICAgICAgICAgICAvL2Rvbid0IGhhdmUgYSBzZWdtZW50IHRvIHBhc3MgYWxvbmcgYmVjYXVzZSB3ZSBkb24ndCBrbm93IHRoZSBkdXJhdGlvbiBvZiB0aGlzIGFzc2V0XG4gICAgICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5Bc3NldEVudGVyZWQsIHsgc2VnbWVudDogdW5kZWZpbmVkLCBhc3NldDogYXNzZXRJbmZvIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25OZXdBc3NldEVuY291bnRlcmVkKGN1ZTogVGV4dFRyYWNrQ3VlLCBwcmV2aW91c0Fzc2V0OiBBc3NldEluZm8sIG5ld0Fzc2V0OiBBc3NldEluZm8pOiB2b2lkIHtcbiAgICAgICAgLy93aWxsIHdlIHN0aWxsIGJlIGluIGFuIGFkIGJyZWFrIGFmdGVyIHRoaXMgYXNzZXQ/XG4gICAgICAgIHRoaXMuX2luQWRCcmVhayA9IG5ld0Fzc2V0LmlzQWQ7XG5cbiAgICAgICAgaWYgKHByZXZpb3VzQXNzZXQuaXNBZCAmJiB0aGlzLl9jdXJyZW50QWRCcmVhaykge1xuICAgICAgICAgICAgLy9sZWF2aW5nIGFkIGJyZWFrXG4gICAgICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5Bc3NldEV4aXRlZCwgeyBzZWdtZW50OiB0aGlzLl9jdXJyZW50QWRCcmVhay5nZXRTZWdtZW50QXQoMCksIGFzc2V0OiBwcmV2aW91c0Fzc2V0IH0pO1xuICAgICAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuQWRCcmVha0V4aXRlZCwgeyBhZEJyZWFrOiB0aGlzLl9jdXJyZW50QWRCcmVhayB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vZG9uJ3QgaGF2ZSBhIHNlZ21lbnQgdG8gcGFzcyBhbG9uZyBiZWNhdXNlIHdlIGRvbid0IGtub3cgdGhlIGR1cmF0aW9uIG9mIHRoaXMgYXNzZXRcbiAgICAgICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLkFzc2V0RXhpdGVkLCB7IHNlZ21lbnQ6IHVuZGVmaW5lZCwgYXNzZXQ6IHByZXZpb3VzQXNzZXQgfSk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9vbkFzc2V0RW5jb3VudGVyZWQoY3VlLCBuZXdBc3NldCk7XG4gICAgfVxuXG4gICAgcHVibGljIG9uVGV4dFRyYWNrQ2hhbmdlZChjaGFuZ2VUcmFja0V2ZW50OiBUcmFja0V2ZW50KTogdm9pZCB7XG4gICAgICAgIC8vZG8gbm90aGluZ1xuICAgIH1cblxuICAgIGdldCB2ZXJzaW9uKCk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiAnMDIuMDAuMTgwNTA0MDAnOyAvL3dpbGwgYmUgbW9kaWZpZWQgYnkgdGhlIGJ1aWxkIHNjcmlwdFxuICAgIH1cbn1cbiIsIlxuLy9wb2x5ZmlsbCBBcnJheS5maW5kKClcbi8vaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvSmF2YVNjcmlwdC9SZWZlcmVuY2UvR2xvYmFsX09iamVjdHMvQXJyYXkvZmluZFxuLy8gaHR0cHM6Ly90YzM5LmdpdGh1Yi5pby9lY21hMjYyLyNzZWMtYXJyYXkucHJvdG90eXBlLmZpbmRcbmlmICghQXJyYXkucHJvdG90eXBlLmZpbmQpIHtcbiAgT2JqZWN0LmRlZmluZVByb3BlcnR5KEFycmF5LnByb3RvdHlwZSwgJ2ZpbmQnLCB7XG4gICAgdmFsdWU6IGZ1bmN0aW9uKHByZWRpY2F0ZTphbnkpIHtcbiAgICAgLy8gMS4gTGV0IE8gYmUgPyBUb09iamVjdCh0aGlzIHZhbHVlKS5cbiAgICAgIGlmICh0aGlzID09IG51bGwpIHtcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignXCJ0aGlzXCIgaXMgbnVsbCBvciBub3QgZGVmaW5lZCcpO1xuICAgICAgfVxuXG4gICAgICB2YXIgbyA9IE9iamVjdCh0aGlzKTtcblxuICAgICAgLy8gMi4gTGV0IGxlbiBiZSA/IFRvTGVuZ3RoKD8gR2V0KE8sIFwibGVuZ3RoXCIpKS5cbiAgICAgIHZhciBsZW4gPSBvLmxlbmd0aCA+Pj4gMDtcblxuICAgICAgLy8gMy4gSWYgSXNDYWxsYWJsZShwcmVkaWNhdGUpIGlzIGZhbHNlLCB0aHJvdyBhIFR5cGVFcnJvciBleGNlcHRpb24uXG4gICAgICBpZiAodHlwZW9mIHByZWRpY2F0ZSAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdwcmVkaWNhdGUgbXVzdCBiZSBhIGZ1bmN0aW9uJyk7XG4gICAgICB9XG5cbiAgICAgIC8vIDQuIElmIHRoaXNBcmcgd2FzIHN1cHBsaWVkLCBsZXQgVCBiZSB0aGlzQXJnOyBlbHNlIGxldCBUIGJlIHVuZGVmaW5lZC5cbiAgICAgIHZhciB0aGlzQXJnID0gYXJndW1lbnRzWzFdO1xuXG4gICAgICAvLyA1LiBMZXQgayBiZSAwLlxuICAgICAgdmFyIGsgPSAwO1xuXG4gICAgICAvLyA2LiBSZXBlYXQsIHdoaWxlIGsgPCBsZW5cbiAgICAgIHdoaWxlIChrIDwgbGVuKSB7XG4gICAgICAgIC8vIGEuIExldCBQayBiZSAhIFRvU3RyaW5nKGspLlxuICAgICAgICAvLyBiLiBMZXQga1ZhbHVlIGJlID8gR2V0KE8sIFBrKS5cbiAgICAgICAgLy8gYy4gTGV0IHRlc3RSZXN1bHQgYmUgVG9Cb29sZWFuKD8gQ2FsbChwcmVkaWNhdGUsIFQsIMKrIGtWYWx1ZSwgaywgTyDCuykpLlxuICAgICAgICAvLyBkLiBJZiB0ZXN0UmVzdWx0IGlzIHRydWUsIHJldHVybiBrVmFsdWUuXG4gICAgICAgIHZhciBrVmFsdWUgPSBvW2tdO1xuICAgICAgICBpZiAocHJlZGljYXRlLmNhbGwodGhpc0FyZywga1ZhbHVlLCBrLCBvKSkge1xuICAgICAgICAgIHJldHVybiBrVmFsdWU7XG4gICAgICAgIH1cbiAgICAgICAgLy8gZS4gSW5jcmVhc2UgayBieSAxLlxuICAgICAgICBrKys7XG4gICAgICB9XG5cbiAgICAgIC8vIDcuIFJldHVybiB1bmRlZmluZWQuXG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgfSk7XG59IiwiXG4vL3BvbHlmaWxsIGZvciBPYmplY3QuYXNzaWduKCkgZm9yIElFMTFcbi8vaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvSmF2YVNjcmlwdC9SZWZlcmVuY2UvR2xvYmFsX09iamVjdHMvT2JqZWN0L2Fzc2lnblxuaWYgKHR5cGVvZiBPYmplY3QuYXNzaWduICE9ICdmdW5jdGlvbicpIHtcbiAgKGZ1bmN0aW9uICgpIHtcbiAgICBPYmplY3QuYXNzaWduID0gZnVuY3Rpb24gKHRhcmdldDogYW55KSB7XG4gICAgICAndXNlIHN0cmljdCc7XG4gICAgICAvLyBXZSBtdXN0IGNoZWNrIGFnYWluc3QgdGhlc2Ugc3BlY2lmaWMgY2FzZXMuXG4gICAgICBpZiAodGFyZ2V0ID09PSB1bmRlZmluZWQgfHwgdGFyZ2V0ID09PSBudWxsKSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0Nhbm5vdCBjb252ZXJ0IHVuZGVmaW5lZCBvciBudWxsIHRvIG9iamVjdCcpO1xuICAgICAgfVxuXG4gICAgICB2YXIgb3V0cHV0ID0gT2JqZWN0KHRhcmdldCk7XG4gICAgICBmb3IgKHZhciBpbmRleCA9IDE7IGluZGV4IDwgYXJndW1lbnRzLmxlbmd0aDsgaW5kZXgrKykge1xuICAgICAgICB2YXIgc291cmNlID0gYXJndW1lbnRzW2luZGV4XTtcbiAgICAgICAgaWYgKHNvdXJjZSAhPT0gdW5kZWZpbmVkICYmIHNvdXJjZSAhPT0gbnVsbCkge1xuICAgICAgICAgIGZvciAodmFyIG5leHRLZXkgaW4gc291cmNlKSB7XG4gICAgICAgICAgICBpZiAoc291cmNlLmhhc093blByb3BlcnR5KG5leHRLZXkpKSB7XG4gICAgICAgICAgICAgIG91dHB1dFtuZXh0S2V5XSA9IHNvdXJjZVtuZXh0S2V5XTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBvdXRwdXQ7XG4gICAgfTtcbiAgfSkoKTtcbn0iLCJcbi8vcG9seWZpbGwgZm9yIFZUVEN1ZSBmb3IgTVMgRWRnZSBhbmQgSUUxMVxuKGZ1bmN0aW9uICgpIHtcbiAgICAoPGFueT53aW5kb3cpLlZUVEN1ZSA9ICg8YW55PndpbmRvdykuVlRUQ3VlIHx8ICg8YW55PndpbmRvdykuVGV4dFRyYWNrQ3VlO1xufSkoKTtcbiIsImltcG9ydCAnLi9wb2x5ZmlsbC92dHQtY3VlJztcbmltcG9ydCAnLi9wb2x5ZmlsbC9vYmplY3QnO1xuaW1wb3J0ICcuL3BvbHlmaWxsL2FycmF5JztcbmltcG9ydCB7IFBsYXllciB9IGZyb20gJy4vcGxheWVyJztcbmltcG9ydCB7IEFkYXB0aXZlUGxheWVyIH0gZnJvbSAnLi9hZGFwdGl2ZS1wbGF5ZXInO1xuaW1wb3J0IHsgTmF0aXZlUGxheWVyIH0gZnJvbSAnLi9uYXRpdmUtcGxheWVyJztcblxuXG5mdW5jdGlvbiBpc05hdGl2ZVBsYXliYWNrU3VwcG9ydGVkKCk6IGJvb2xlYW4ge1xuICAgIHRyeSB7XG4gICAgICAgIGxldCB2aWRlbyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3ZpZGVvJyk7XG5cbiAgICAgICAgaWYgKHZpZGVvLmNhblBsYXlUeXBlKSB7XG4gICAgICAgICAgICByZXR1cm4gdmlkZW8uY2FuUGxheVR5cGUoJ2FwcGxpY2F0aW9uL3ZuZC5hcHBsZS5tcGVndXJsJykgIT09ICcnO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgcmV0dXJuIGZhbHNlO1xufVxuXG5mdW5jdGlvbiBpc0h0bWxQbGF5YmFja1N1cHBvcnRlZCgpOiBib29sZWFuIHtcbiAgICBpZiAoJ01lZGlhU291cmNlJyBpbiB3aW5kb3cgJiYgTWVkaWFTb3VyY2UuaXNUeXBlU3VwcG9ydGVkKSB7XG4gICAgICAgIHJldHVybiBNZWRpYVNvdXJjZS5pc1R5cGVTdXBwb3J0ZWQoJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40MkUwMUUsbXA0YS40MC4yXCInKTtcbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIGN1cnJlbnRTY3JpcHQoKSB7XG4gICAgLy9oYWNreSwgYnV0IHdvcmtzIGZvciBvdXIgbmVlZHNcbiAgICBjb25zdCBzY3JpcHRzID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ3NjcmlwdCcpO1xuICAgIGlmIChzY3JpcHRzICYmIHNjcmlwdHMubGVuZ3RoKSB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc2NyaXB0cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgaWYgKHNjcmlwdHNbaV0uc3JjLmluZGV4T2YoJ3VwbHluay1jb3JlLmpzJykgPiAtMSB8fCBzY3JpcHRzW2ldLnNyYy5pbmRleE9mKCd1cGx5bmstY29yZS5taW4uanMnKSA+IC0xKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNjcmlwdHNbaV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gdW5kZWZpbmVkO1xufVxuXG52YXIgbG9hZGVkVXBseW5rQWRhcHRpdmUgPSB0cnVlO1xuXG5mdW5jdGlvbiBsb2FkVXBseW5rQWRhcHRpdmVQbGF5ZXIodmlkZW86IEhUTUxWaWRlb0VsZW1lbnQsIG9wdGlvbnM/OiBQbGF5ZXJPcHRpb25zLCBjYWxsYmFjaz86IChwbGF5ZXI6IFBsYXllcikgPT4gdm9pZCkge1xuXG4gICAgLy9sb2FkIHVwbHluay1hZGFwdGl2ZS5qc1xuICAgIGxldCB1cmwgPSBjdXJyZW50U2NyaXB0KCkuc3JjLnN1YnN0cmluZygwLCBjdXJyZW50U2NyaXB0KCkuc3JjLmxhc3RJbmRleE9mKCcvJykgKyAxKSArICd1cGx5bmstYWRhcHRpdmUuanMnO1xuXG4gICAgLy8gaWYgdXNpbmcgV2ViQXNzZW1ibHksIHRoZSB3YXNtIGlzIGFscmVhZHkgbG9hZGVkIGZyb20gdGhlIGh0bWxcbiAgICBsZXQgZW5hYmxlV0FTTSA9IGZhbHNlO1xuICAgIGlmIChlbmFibGVXQVNNICYmIHR5cGVvZiBXZWJBc3NlbWJseSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgY2FsbGJhY2sobmV3IEFkYXB0aXZlUGxheWVyKHZpZGVvLCBvcHRpb25zKSk7XG4gICAgfVxuICAgIGVsc2UgaWYgKCFpc1NjcmlwdEFscmVhZHlJbmNsdWRlZCh1cmwpKSB7XG4gICAgICAgIGxvYWRlZFVwbHlua0FkYXB0aXZlID0gZmFsc2U7XG4gICAgICAgIGxvYWRTY3JpcHRBc3luYyh1cmwsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGxvYWRlZFVwbHlua0FkYXB0aXZlID0gdHJ1ZTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG5ldyBBZGFwdGl2ZVBsYXllcih2aWRlbywgb3B0aW9ucykpO1xuICAgICAgICB9KTtcbiAgICB9IGVsc2UgaWYgKGxvYWRlZFVwbHlua0FkYXB0aXZlKSB7XG4gICAgICAgIGNhbGxiYWNrKG5ldyBBZGFwdGl2ZVBsYXllcih2aWRlbywgb3B0aW9ucykpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIC8vc2NyaXB0IGlzIGxvYWRpbmcgc28gd2UnbGwga2VlcCBjaGVja2luZyBpdCdzXG4gICAgICAgIC8vIHN0YXR1cyBiZWZvcmUgZmlyaW5nIHRoZSBjYWxsYmFja1xuICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGxvYWRVcGx5bmtBZGFwdGl2ZVBsYXllcih2aWRlbywgb3B0aW9ucywgY2FsbGJhY2spO1xuICAgICAgICB9LCA1MDApO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gbG9hZFNjcmlwdEFzeW5jKHVybDogc3RyaW5nLCBjYWxsYmFjazogKCkgPT4gdm9pZCk6IHZvaWQge1xuICAgIGxldCBoZWFkID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ2hlYWQnKVswXTtcbiAgICBsZXQgc2NyaXB0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc2NyaXB0Jyk7XG5cbiAgICBzY3JpcHQudHlwZSA9ICd0ZXh0L2phdmFzY3JpcHQnO1xuICAgIHNjcmlwdC5zcmMgPSB1cmw7XG5cbiAgICBzY3JpcHQub25sb2FkID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBjYWxsYmFjaygpO1xuICAgIH07XG5cbiAgICBoZWFkLmFwcGVuZENoaWxkKHNjcmlwdCk7XG59XG5cbmZ1bmN0aW9uIGlzU2NyaXB0QWxyZWFkeUluY2x1ZGVkKHVybDogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgdmFyIHNjcmlwdHMgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZShcInNjcmlwdFwiKTtcbiAgICBpZiAoc2NyaXB0cyAmJiBzY3JpcHRzLmxlbmd0aCkge1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHNjcmlwdHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGlmIChzY3JpcHRzW2ldLnNyYyA9PT0gdXJsKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUFkYXB0aXZlUGxheWVyKHZpZGVvOiBIVE1MVmlkZW9FbGVtZW50LCBvcHRpb25zOiBhbnksIGNhbGxiYWNrPzogKHBsYXllcjogUGxheWVyKSA9PiB2b2lkKSB7XG5cbiAgICBpZiAob3B0aW9ucy5wcmVmZXJOYXRpdmVQbGF5YmFjaykge1xuICAgICAgICBpZiAoaXNOYXRpdmVQbGF5YmFja1N1cHBvcnRlZCgpKSB7XG4gICAgICAgICAgICAvL2NvbnNvbGUubG9nKFwidXNpbmcgbmF0aXZlIHBsYXliYWNrXCIpO1xuICAgICAgICAgICAgY2FsbGJhY2sobmV3IE5hdGl2ZVBsYXllcih2aWRlbywgb3B0aW9ucykpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9IGVsc2UgaWYgKGlzSHRtbFBsYXliYWNrU3VwcG9ydGVkKCkpIHtcbiAgICAgICAgICAgIC8vY29uc29sZS5sb2coXCJmYWxsaW5nIGJhY2sgdG8gdXBseW5rIHBsYXllclwiKTtcbiAgICAgICAgICAgIGxvYWRVcGx5bmtBZGFwdGl2ZVBsYXllcih2aWRlbywgb3B0aW9ucywgY2FsbGJhY2spO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKGlzSHRtbFBsYXliYWNrU3VwcG9ydGVkKCkpIHtcbiAgICAgICAgICAgIC8vY29uc29sZS5sb2coXCJ1c2luZyB1cGx5bmsgcGxheWVyXCIpO1xuICAgICAgICAgICAgbG9hZFVwbHlua0FkYXB0aXZlUGxheWVyKHZpZGVvLCBvcHRpb25zLCBjYWxsYmFjayk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gZWxzZSBpZiAoaXNOYXRpdmVQbGF5YmFja1N1cHBvcnRlZCgpKSB7XG4gICAgICAgICAgICAvL2NvbnNvbGUubG9nKFwiZmFsbGluZyBiYWNrIHRvIG5hdGl2ZSBwbGF5YmFja1wiKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG5ldyBOYXRpdmVQbGF5ZXIodmlkZW8sIG9wdGlvbnMpKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgIH1cbiAgICBjb25zb2xlLndhcm4oXCJubyBwbGF5YmFjayBtb2RlIHN1cHBvcnRlZFwiKTtcbiAgICBjYWxsYmFjayh1bmRlZmluZWQpO1xufVxuXG4oPGFueT53aW5kb3cpLmNyZWF0ZUFkYXB0aXZlUGxheWVyID0gY3JlYXRlQWRhcHRpdmVQbGF5ZXI7XG4oPGFueT53aW5kb3cpLkFkYXB0aXZlUGxheWVyID0gQWRhcHRpdmVQbGF5ZXI7IiwiaW1wb3J0IHsgU3RyaW5nTWFwIH0gZnJvbSAnLi9zdHJpbmctbWFwJztcblxuLy9odHRwOi8vd3d3LmRhdGNobGV5Lm5hbWUvZXM2LWV2ZW50ZW1pdHRlci9cbi8vaHR0cHM6Ly9naXN0LmdpdGh1Yi5jb20vZGF0Y2hsZXkvMzczNTNkNmEyY2I2Mjk2ODdlYjlcbi8vaHR0cDovL2NvZGVwZW4uaW8veXVrdWxlbGUvcGVuL3lOVlZ4Vi8/ZWRpdG9ycz0wMDFcbmV4cG9ydCBjbGFzcyBPYnNlcnZhYmxlIHtcbiAgICBwcml2YXRlIF9saXN0ZW5lcnM6IFN0cmluZ01hcDxhbnk+O1xuXG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHRoaXMuX2xpc3RlbmVycyA9IG5ldyBTdHJpbmdNYXAoKTtcbiAgICB9XG5cbiAgICBvbihsYWJlbDogc3RyaW5nLCBjYWxsYmFjazogYW55KSB7XG4gICAgICAgIHRoaXMuX2xpc3RlbmVycy5oYXMobGFiZWwpIHx8IHRoaXMuX2xpc3RlbmVycy5zZXQobGFiZWwsIFtdKTtcbiAgICAgICAgdGhpcy5fbGlzdGVuZXJzLmdldChsYWJlbCkucHVzaChjYWxsYmFjayk7XG4gICAgfVxuXG4gICAgb2ZmKGxhYmVsOiBzdHJpbmcsIGNhbGxiYWNrOiBhbnkpIHtcbiAgICAgICAgbGV0IGxpc3RlbmVycyA9IHRoaXMuX2xpc3RlbmVycy5nZXQobGFiZWwpO1xuICAgICAgICBsZXQgaW5kZXg6IG51bWJlcjtcblxuICAgICAgICBpZiAobGlzdGVuZXJzICYmIGxpc3RlbmVycy5sZW5ndGgpIHtcbiAgICAgICAgICAgIGluZGV4ID0gbGlzdGVuZXJzLnJlZHVjZSgoaTogbnVtYmVyLCBsaXN0ZW5lcjogYW55LCBpbmRleDogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuICh0aGlzLl9pc0Z1bmN0aW9uKGxpc3RlbmVyKSAmJiBsaXN0ZW5lciA9PT0gY2FsbGJhY2spID8gaSA9IGluZGV4IDogaTtcbiAgICAgICAgICAgIH0sIC0xKTtcblxuICAgICAgICAgICAgaWYgKGluZGV4ID4gLTEpIHtcbiAgICAgICAgICAgICAgICBsaXN0ZW5lcnMuc3BsaWNlKGluZGV4LCAxKTtcbiAgICAgICAgICAgICAgICB0aGlzLl9saXN0ZW5lcnMuc2V0KGxhYmVsLCBsaXN0ZW5lcnMpO1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBmaXJlKGxhYmVsOiBzdHJpbmcsIC4uLmFyZ3M6IGFueVtdKSB7XG4gICAgICAgIGxldCBsaXN0ZW5lcnMgPSB0aGlzLl9saXN0ZW5lcnMuZ2V0KGxhYmVsKTtcblxuICAgICAgICBpZiAobGlzdGVuZXJzICYmIGxpc3RlbmVycy5sZW5ndGgpIHtcbiAgICAgICAgICAgIGxpc3RlbmVycy5mb3JFYWNoKChsaXN0ZW5lcjogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgbGlzdGVuZXIoLi4uYXJncyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9pc0Z1bmN0aW9uKG9iajogYW55KSB7XG4gICAgICAgIHJldHVybiB0eXBlb2Ygb2JqID09ICdmdW5jdGlvbicgfHwgZmFsc2U7XG4gICAgfVxufSIsImltcG9ydCB7IEFkQnJlYWsgfSBmcm9tICcuLi9hZC9hZC1icmVhayc7XG5cbmV4cG9ydCBjbGFzcyBTZWdtZW50TWFwIHtcbiAgICBwcml2YXRlIHJlYWRvbmx5IF9zZWdtZW50czogU2VnbWVudFtdO1xuICAgIHByaXZhdGUgcmVhZG9ubHkgX2FkQnJlYWtzOiBBZEJyZWFrW107XG5cbiAgICBjb25zdHJ1Y3RvcihzZWdtZW50czogU2VnbWVudFtdKSB7XG4gICAgICAgIHRoaXMuX3NlZ21lbnRzID0gc2VnbWVudHM7XG4gICAgICAgIHRoaXMuX2FkQnJlYWtzID0gW107XG4gICAgICAgIHRoaXMuX2luaXRBZGJyZWFrcygpO1xuICAgIH1cblxuICAgIGZpbmRTZWdtZW50KHRpbWU6IG51bWJlcik6IFNlZ21lbnQgfCB1bmRlZmluZWQge1xuICAgICAgICBsZXQgaW5kZXggPSB0aGlzLmdldFNlZ21lbnRJbmRleEF0KHRpbWUpO1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRTZWdtZW50QXQoaW5kZXgpO1xuICAgIH1cblxuICAgIGdldFNlZ21lbnRBdChpbmRleDogbnVtYmVyKTogU2VnbWVudCB7XG4gICAgICAgIGlmIChpbmRleCA+PSAwICYmIGluZGV4IDwgdGhpcy5fc2VnbWVudHMubGVuZ3RoKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fc2VnbWVudHNbaW5kZXhdO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICBnZXRTZWdtZW50SW5kZXhBdCh0aW1lOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX3NlZ21lbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBsZXQgc2VnbWVudCA9IHRoaXMuX3NlZ21lbnRzW2ldO1xuICAgICAgICAgICAgaWYgKHNlZ21lbnQuc3RhcnRUaW1lIDw9IHRpbWUgJiYgdGltZSA8PSBzZWdtZW50LmVuZFRpbWUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gaTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiAtMTtcbiAgICB9XG5cbiAgICBnZXQgbGVuZ3RoKCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLl9zZWdtZW50cy5sZW5ndGg7XG4gICAgfVxuXG4gICAgZ2V0IGFkQnJlYWtzKCk6IEFkQnJlYWtbXSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZEJyZWFrcztcbiAgICB9XG5cbiAgICBnZXQgY29udGVudFNlZ21lbnRzKCk6IFNlZ21lbnRbXSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9zZWdtZW50cy5maWx0ZXIoU2VnbWVudE1hcC5pc0NvbnRlbnQpO1xuICAgIH1cblxuICAgIHN0YXRpYyBpc0FkKHNlZ21lbnQ6IFNlZ21lbnQpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHNlZ21lbnQudHlwZSA9PT0gXCJBRFwiO1xuICAgIH1cblxuICAgIHN0YXRpYyBpc0NvbnRlbnQoc2VnbWVudDogU2VnbWVudCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gc2VnbWVudC50eXBlID09PSBcIkNPTlRFTlRcIjtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9pbml0QWRicmVha3MoKTogdm9pZCB7XG4gICAgICAgIGxldCBhZHM6IFNlZ21lbnRbXSA9IFtdO1xuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fc2VnbWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHdoaWxlIChpIDwgdGhpcy5fc2VnbWVudHMubGVuZ3RoICYmIFNlZ21lbnRNYXAuaXNBZCh0aGlzLl9zZWdtZW50c1tpXSkpIHtcbiAgICAgICAgICAgICAgICBhZHMucHVzaCh0aGlzLl9zZWdtZW50c1tpXSk7XG4gICAgICAgICAgICAgICAgaSsrXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChhZHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgIHRoaXMuX2FkQnJlYWtzLnB1c2gobmV3IEFkQnJlYWsoYWRzKSk7XG4gICAgICAgICAgICAgICAgYWRzID0gW107XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpbkFkQnJlYWsodGltZTogbnVtYmVyKTogYm9vbGVhbiB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fYWRCcmVha3MubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGxldCBhZEJyZWFrID0gdGhpcy5fYWRCcmVha3NbaV07XG4gICAgICAgICAgICBpZiAoYWRCcmVhay5jb250YWlucyh0aW1lKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGdldEFkQnJlYWsodGltZTogbnVtYmVyKTogQWRCcmVhayB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZEJyZWFrcy5maW5kKChhZEJyZWFrOiBBZEJyZWFrKTogYm9vbGVhbiA9PiB7XG4gICAgICAgICAgICByZXR1cm4gYWRCcmVhay5jb250YWlucyh0aW1lKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZ2V0QWRCcmVha3NCZXR3ZWVuKHN0YXJ0OiBudW1iZXIsIGVuZDogbnVtYmVyKTogQWRCcmVha1tdIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkQnJlYWtzLmZpbHRlcigoYWRCcmVhazogQWRCcmVhayk6IGJvb2xlYW4gPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHN0YXJ0IDw9IGFkQnJlYWsuc3RhcnRUaW1lICYmIGFkQnJlYWsuZW5kVGltZSA8PSBlbmQ7XG4gICAgICAgIH0pO1xuICAgIH1cbn0iLCJleHBvcnQgY2xhc3MgU3RyaW5nTWFwPFY+IHtcbiAgICBwcml2YXRlIF9tYXA6IGFueTtcblxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB0aGlzLl9tYXAgPSBuZXcgT2JqZWN0KCk7XG4gICAgfVxuXG4gICAgZ2V0IHNpemUoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIE9iamVjdC5rZXlzKHRoaXMuX21hcCkubGVuZ3RoO1xuICAgIH1cblxuICAgIGhhcyhrZXk6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5fbWFwLmhhc093blByb3BlcnR5KGtleSk7XG4gICAgfVxuXG4gICAgZ2V0KGtleTogc3RyaW5nKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9tYXBba2V5XTtcbiAgICB9XG5cbiAgICBzZXQoa2V5OiBzdHJpbmcsIHZhbHVlOiBWKSB7XG4gICAgICAgIHRoaXMuX21hcFtrZXldID0gdmFsdWU7XG4gICAgfVxuXG4gICAgY2xlYXIoKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyh0aGlzLl9tYXApO1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGtleXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IGtleSA9IGtleXNbaV07XG4gICAgICAgICAgICB0aGlzLl9tYXBba2V5XSA9IG51bGw7XG4gICAgICAgICAgICBkZWxldGUgdGhpcy5fbWFwW2tleV07XG4gICAgICAgIH1cbiAgICB9XG59IiwiaW1wb3J0IHsgdG9IZXhTdHJpbmcgfSBmcm9tICcuL3V0aWxzJztcbmltcG9ydCB7IFRodW1iLCBBc3NldEluZm8sIEFzc2V0SW5mb1NlcnZpY2UgfSBmcm9tICcuLi93ZWItc2VydmljZXMvYXNzZXQtaW5mby1zZXJ2aWNlJztcbmltcG9ydCB7IFNlZ21lbnRNYXAgfSBmcm9tICcuL3NlZ21lbnQtbWFwJztcblxuZXhwb3J0IGludGVyZmFjZSBUaHVtYm5haWwge1xuICAgIHVybDogc3RyaW5nO1xuICAgIGhlaWdodDogbnVtYmVyO1xuICAgIHdpZHRoOiBudW1iZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRUaHVtYm5haWwodGltZTogbnVtYmVyLCBzZWdtZW50czogU2VnbWVudE1hcCwgYXNzZXRJbmZvU2VydmljZTogQXNzZXRJbmZvU2VydmljZSwgdGh1bWJuYWlsU2l6ZTogXCJzbWFsbFwiIHwgXCJsYXJnZVwiID0gXCJzbWFsbFwiKTogVGh1bWJuYWlsIHtcbiAgICBpZiAoaXNOYU4odGltZSkgfHwgdGltZSA8IDApIHtcbiAgICAgICAgdGltZSA9IDA7XG4gICAgfVxuXG4gICAgaWYgKGFzc2V0SW5mb1NlcnZpY2UgJiYgc2VnbWVudHMpIHtcbiAgICAgICAgY29uc3Qgc2VnbWVudCA9IHNlZ21lbnRzLmZpbmRTZWdtZW50KHRpbWUpO1xuICAgICAgICBpZiAoc2VnbWVudCkge1xuICAgICAgICAgICAgY29uc3QgYXNzZXQgPSBhc3NldEluZm9TZXJ2aWNlLmdldEFzc2V0SW5mbyhzZWdtZW50LmlkKTtcbiAgICAgICAgICAgIGlmIChhc3NldCAmJiBhc3NldC50aHVtYnMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBzbGljZU51bWJlciA9IGdldFNsaWNlTnVtYmVyKHRpbWUsIHNlZ21lbnQsIGFzc2V0KTtcbiAgICAgICAgICAgICAgICBjb25zdCB0aHVtYiA9IGdldFRodW1iKGFzc2V0LCB0aHVtYm5haWxTaXplKTtcblxuICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgIHVybDogZ2V0VGh1bWJuYWlsVXJsKGFzc2V0LCBzbGljZU51bWJlciwgdGh1bWIpLFxuICAgICAgICAgICAgICAgICAgICBoZWlnaHQ6IHRodW1iLmhlaWdodCxcbiAgICAgICAgICAgICAgICAgICAgd2lkdGg6IHRodW1iLndpZHRoXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgdXJsOiAnJyxcbiAgICAgICAgaGVpZ2h0OiAwLFxuICAgICAgICB3aWR0aDogMFxuICAgIH07XG59XG5cbmZ1bmN0aW9uIGdldFRodW1ibmFpbFVybChhc3NldDogQXNzZXRJbmZvLCBzbGljZU51bWJlcjogbnVtYmVyLCB0aHVtYjogVGh1bWIpOiBzdHJpbmcge1xuICAgIGxldCBwcmVmaXggPSBhc3NldC50aHVtYlByZWZpeDtcblxuICAgIGlmIChhc3NldC5zdG9yYWdlUGFydGl0aW9ucyAmJiBhc3NldC5zdG9yYWdlUGFydGl0aW9ucy5sZW5ndGgpIHtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhc3NldC5zdG9yYWdlUGFydGl0aW9ucy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgcGFydGl0aW9uID0gYXNzZXQuc3RvcmFnZVBhcnRpdGlvbnNbaV07XG4gICAgICAgICAgICBpZiAocGFydGl0aW9uLnN0YXJ0IDw9IHNsaWNlTnVtYmVyICYmIHNsaWNlTnVtYmVyIDwgcGFydGl0aW9uLmVuZCkge1xuICAgICAgICAgICAgICAgIHByZWZpeCA9IHBhcnRpdGlvbi51cmw7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAocHJlZml4W3ByZWZpeC5sZW5ndGggLSAxXSAhPT0gJy8nKSB7XG4gICAgICAgIHByZWZpeCArPSAnLyc7XG4gICAgfVxuXG4gICAgY29uc3Qgc2xpY2VIZXhOdW1iZXIgPSB0b0hleFN0cmluZyhzbGljZU51bWJlcik7XG5cbiAgICByZXR1cm4gYCR7cHJlZml4fSR7dGh1bWIucHJlZml4fSR7c2xpY2VIZXhOdW1iZXJ9LmpwZ2A7XG59XG5cbmZ1bmN0aW9uIGdldFRodW1iKGFzc2V0OiBBc3NldEluZm8sIHNpemU6ICdzbWFsbCcgfCAnbGFyZ2UnKTogVGh1bWIge1xuICAgIC8vZGVmYXVsdCB0byBzbWFsbGVzdCB0aHVtYlxuICAgIGxldCB0aHVtYjogVGh1bWIgPSBhc3NldC50aHVtYnNbMF07XG5cbiAgICBpZiAoc2l6ZSA9PT0gXCJsYXJnZVwiKSB7XG4gICAgICAgIC8vbGFzdCB0aHVtYiBpcyB0aGUgbGFyZ2VzdFxuICAgICAgICB0aHVtYiA9IGFzc2V0LnRodW1ic1thc3NldC50aHVtYnMubGVuZ3RoIC0gMV07XG4gICAgfVxuXG4gICAgcmV0dXJuIHRodW1iO1xufVxuXG5cbmZ1bmN0aW9uIGdldFNsaWNlTnVtYmVyKHRpbWU6IG51bWJlciwgc2VnbWVudDogU2VnbWVudCwgYXNzZXQ6IEFzc2V0SW5mbyk6IG51bWJlciB7XG4gICAgbGV0IHNsaWNlTnVtYmVyID0gTWF0aC5jZWlsKCh0aW1lIC0gc2VnbWVudC5zdGFydFRpbWUpIC8gYXNzZXQuc2xpY2VEdXJhdGlvbik7XG4gICAgc2xpY2VOdW1iZXIgKz0gc2VnbWVudC5pbmRleDtcblxuICAgIGlmIChzbGljZU51bWJlciA+IGFzc2V0Lm1heFNsaWNlKSB7XG4gICAgICAgIHNsaWNlTnVtYmVyID0gYXNzZXQubWF4U2xpY2U7XG4gICAgfVxuXG4gICAgcmV0dXJuIHNsaWNlTnVtYmVyO1xufVxuIiwiZXhwb3J0IGZ1bmN0aW9uIHRvVGltZVN0cmluZyh0aW1lOiBudW1iZXIpIHtcbiAgICBpZiAoaXNOYU4odGltZSkpIHtcbiAgICAgICAgdGltZSA9IDA7XG4gICAgfVxuXG4gICAgbGV0IG5lZ2F0aXZlID0gKHRpbWUgPCAwKSA/IFwiLVwiIDogXCJcIjtcblxuICAgIHRpbWUgPSBNYXRoLmFicyh0aW1lKTtcblxuICAgIGxldCBzZWNvbmRzID0gKHRpbWUgJSA2MCkgfCAwO1xuICAgIGxldCBtaW51dGVzID0gKCh0aW1lIC8gNjApICUgNjApIHwgMDtcbiAgICBsZXQgaG91cnMgPSAoKCh0aW1lIC8gNjApIC8gNjApICUgNjApIHwgMDtcbiAgICBsZXQgc2hvd0hvdXJzID0gaG91cnMgPiAwO1xuXG4gICAgbGV0IGhyU3RyID0gaG91cnMgPCAxMCA/IGAwJHtob3Vyc31gIDogYCR7aG91cnN9YDtcbiAgICBsZXQgbWluU3RyID0gbWludXRlcyA8IDEwID8gYDAke21pbnV0ZXN9YCA6IGAke21pbnV0ZXN9YDtcbiAgICBsZXQgc2VjU3RyID0gc2Vjb25kcyA8IDEwID8gYDAke3NlY29uZHN9YCA6IGAke3NlY29uZHN9YDtcblxuICAgIGlmIChzaG93SG91cnMpIHtcbiAgICAgICAgcmV0dXJuIGAke25lZ2F0aXZlfSR7aHJTdHJ9OiR7bWluU3RyfToke3NlY1N0cn1gO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBgJHtuZWdhdGl2ZX0ke21pblN0cn06JHtzZWNTdHJ9YDtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b0hleFN0cmluZyhudW1iZXI6IG51bWJlciwgbWluTGVuZ3RoID0gOCk6IHN0cmluZyB7XG4gICAgbGV0IGhleCA9IG51bWJlci50b1N0cmluZygxNikudG9VcHBlckNhc2UoKTtcbiAgICB3aGlsZSAoaGV4Lmxlbmd0aCA8IG1pbkxlbmd0aCkge1xuICAgICAgICBoZXggPSBcIjBcIiArIGhleDtcbiAgICB9XG5cbiAgICByZXR1cm4gaGV4O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYmFzZTY0VG9CdWZmZXIoYjY0ZW5jb2RlZDogc3RyaW5nKTogVWludDhBcnJheSB7XG4gICAgcmV0dXJuIG5ldyBVaW50OEFycmF5KGF0b2IoYjY0ZW5jb2RlZCkuc3BsaXQoXCJcIikubWFwKGZ1bmN0aW9uIChjKSB7IHJldHVybiBjLmNoYXJDb2RlQXQoMCk7IH0pKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gc2xpY2UoZGF0YTogVWludDhBcnJheSwgc3RhcnQ6IG51bWJlciwgZW5kPzogbnVtYmVyKTogVWludDhBcnJheSB7XG4gICAgLy9JRSAxMSBkb2Vzbid0IHN1cHBvcnQgc2xpY2UoKSBvbiBUeXBlZEFycmF5IG9iamVjdHNcbiAgICBpZiAoZGF0YS5zbGljZSkge1xuICAgICAgICByZXR1cm4gZGF0YS5zbGljZShzdGFydCwgZW5kKTtcbiAgICB9XG5cbiAgICBpZiAoZW5kKSB7XG4gICAgICAgIHJldHVybiBkYXRhLnN1YmFycmF5KHN0YXJ0LCBlbmQpO1xuICAgIH1cblxuICAgIHJldHVybiBkYXRhLnN1YmFycmF5KHN0YXJ0KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzTG9jYWxTdG9yYWdlQXZhaWxhYmxlKClcbntcbiAgICAvLyBDb3BpZWQgZnJvbSBQbHlyIGNvZGVcbiAgICBpZiAoISgnbG9jYWxTdG9yYWdlJyBpbiB3aW5kb3cpKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICAvLyBUcnkgdG8gdXNlIGl0IChpdCBtaWdodCBiZSBkaXNhYmxlZCwgZS5nLiB1c2VyIGlzIGluIHByaXZhdGUgbW9kZSlcbiAgICAvLyBzZWU6IGh0dHBzOi8vZ2l0aHViLmNvbS9TZWx6L3BseXIvaXNzdWVzLzEzMVxuICAgIHRyeSB7XG4gICAgICAgIC8vIEFkZCB0ZXN0IGl0ZW1cbiAgICAgICAgd2luZG93LmxvY2FsU3RvcmFnZS5zZXRJdGVtKCdfX190ZXN0JywgJ09LJyk7XG5cbiAgICAgICAgLy8gR2V0IHRoZSB0ZXN0IGl0ZW1cbiAgICAgICAgdmFyIHJlc3VsdCA9IHdpbmRvdy5sb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnX19fdGVzdCcpO1xuXG4gICAgICAgIC8vIENsZWFuIHVwXG4gICAgICAgIHdpbmRvdy5sb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbSgnX19fdGVzdCcpO1xuXG4gICAgICAgIC8vIENoZWNrIGlmIHZhbHVlIG1hdGNoZXNcbiAgICAgICAgcmV0dXJuIChyZXN1bHQgPT09ICdPSycpO1xuICAgIH1cbiAgICBjYXRjaCAoZSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UHJvdG9jb2wodXJsOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIHRyeSB7XG4gICAgICAgIC8vbm90IGFsbCBicm93c2VycyBzdXBwb3J0IFVSTCBhcGkgKElFMTEuLi4pXG4gICAgICAgIHJldHVybiBuZXcgVVJMKHVybCkucHJvdG9jb2w7XG4gICAgfSBjYXRjaCAoXykgeyB9XG5cbiAgICB2YXIgbGluayA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcbiAgICBsaW5rLnNldEF0dHJpYnV0ZSgnaHJlZicsIHVybCk7XG5cbiAgICByZXR1cm4gbGluay5wcm90b2NvbDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzSUUxMU9yRWRnZSgpOiBib29sZWFuIHtcbiAgICBsZXQgaXNJRTExID0gKG5hdmlnYXRvci5hcHBWZXJzaW9uLmluZGV4T2YoJ1dpbmRvd3MgTlQnKSAhPT0gLTEpICYmIChuYXZpZ2F0b3IuYXBwVmVyc2lvbi5pbmRleE9mKCdydjoxMScpICE9PSAtMSk7XG4gICAgbGV0IGlzRWRnZSA9IG5hdmlnYXRvci5hcHBWZXJzaW9uLmluZGV4T2YoJ0VkZ2UnKSAhPT0gLTE7XG4gICAgcmV0dXJuIGlzSUUxMSB8fCBpc0VkZ2U7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzdHJpbmdUb0FycmF5MTYoc3RyaW5nRGF0YTogc3RyaW5nKTogVWludDE2QXJyYXkge1xuICAgIGxldCBidWZmZXIgPSBuZXcgQXJyYXlCdWZmZXIoc3RyaW5nRGF0YS5sZW5ndGggKiAyKTsgLy8gMiBieXRlcyBmb3IgZWFjaCBjaGFyXG4gICAgbGV0IGFycmF5ID0gbmV3IFVpbnQxNkFycmF5KGJ1ZmZlcik7XG4gICAgZm9yIChsZXQgaSA9IDAsIHN0ckxlbiA9IHN0cmluZ0RhdGEubGVuZ3RoOyBpIDwgc3RyTGVuOyBpKyspIHtcbiAgICAgICAgYXJyYXlbaV0gPSBzdHJpbmdEYXRhLmNoYXJDb2RlQXQoaSk7XG4gICAgfVxuICAgIHJldHVybiBhcnJheTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFycmF5MTZUb1N0cmluZyhhcnJheTogVWludDE2QXJyYXkpOiBTdHJpbmcge1xuICAgIGxldCB1aW50MTZhcnJheSA9IG5ldyBVaW50MTZBcnJheShhcnJheS5idWZmZXIpO1xuICAgIHJldHVybiBTdHJpbmcuZnJvbUNoYXJDb2RlLmFwcGx5KG51bGwsIHVpbnQxNmFycmF5KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGJhc2U2NERlY29kZVVpbnQ4QXJyYXkoaW5wdXQ6IGFueSk6IFVpbnQ4QXJyYXkge1xuICAgIGxldCByYXcgPSB3aW5kb3cuYXRvYihpbnB1dCk7XG4gICAgbGV0IHJhd0xlbmd0aCA9IHJhdy5sZW5ndGg7XG4gICAgbGV0IGFycmF5ID0gbmV3IFVpbnQ4QXJyYXkobmV3IEFycmF5QnVmZmVyKHJhd0xlbmd0aCkpO1xuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCByYXdMZW5ndGg7IGkrKylcbiAgICAgICAgYXJyYXlbaV0gPSByYXcuY2hhckNvZGVBdChpKTtcblxuICAgIHJldHVybiBhcnJheTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGJhc2U2NEVuY29kZVVpbnQ4QXJyYXkoaW5wdXQ6IFVpbnQ4QXJyYXkpOiBzdHJpbmcge1xuICAgIGxldCBrZXlTdHIgPSBcIkFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU2Nzg5Ky89XCI7XG4gICAgbGV0IG91dHB1dCA9IFwiXCI7XG4gICAgbGV0IGNocjEsIGNocjIsIGNocjMsIGVuYzEsIGVuYzIsIGVuYzMsIGVuYzQ7XG4gICAgbGV0IGkgPSAwO1xuXG4gICAgd2hpbGUgKGkgPCBpbnB1dC5sZW5ndGgpIHtcbiAgICAgICAgY2hyMSA9IGlucHV0W2krK107XG4gICAgICAgIGNocjIgPSBpIDwgaW5wdXQubGVuZ3RoID8gaW5wdXRbaSsrXSA6IE51bWJlci5OYU47IC8vIE5vdCBzdXJlIGlmIHRoZSBpbmRleFxuICAgICAgICBjaHIzID0gaSA8IGlucHV0Lmxlbmd0aCA/IGlucHV0W2krK10gOiBOdW1iZXIuTmFOOyAvLyBjaGVja3MgYXJlIG5lZWRlZCBoZXJlXG5cbiAgICAgICAgZW5jMSA9IGNocjEgPj4gMjtcbiAgICAgICAgZW5jMiA9ICgoY2hyMSAmIDMpIDw8IDQpIHwgKGNocjIgPj4gNCk7XG4gICAgICAgIGVuYzMgPSAoKGNocjIgJiAxNSkgPDwgMikgfCAoY2hyMyA+PiA2KTtcbiAgICAgICAgZW5jNCA9IGNocjMgJiA2MztcblxuICAgICAgICBpZiAoaXNOYU4oY2hyMikpIHtcbiAgICAgICAgICAgIGVuYzMgPSBlbmM0ID0gNjQ7XG4gICAgICAgIH0gZWxzZSBpZiAoaXNOYU4oY2hyMykpIHtcbiAgICAgICAgICAgIGVuYzQgPSA2NDtcbiAgICAgICAgfVxuICAgICAgICBvdXRwdXQgKz0ga2V5U3RyLmNoYXJBdChlbmMxKSArIGtleVN0ci5jaGFyQXQoZW5jMikgK1xuICAgICAgICAgICAga2V5U3RyLmNoYXJBdChlbmMzKSArIGtleVN0ci5jaGFyQXQoZW5jNCk7XG4gICAgfVxuICAgIHJldHVybiBvdXRwdXQ7XG59IiwiaW1wb3J0IHsgU2VnbWVudE1hcCB9IGZyb20gJy4uL3V0aWxzL3NlZ21lbnQtbWFwJztcbmltcG9ydCB7IFN0cmluZ01hcCB9IGZyb20gJy4uL3V0aWxzL3N0cmluZy1tYXAnO1xuXG5jb25zdCBlbnVtIFR2UmF0aW5nIHtcbiAgICBOb3RBdmFpbGFibGUgPSAtMSxcbiAgICBOb3RBcHBsaWNhYmxlID0gMCxcbiAgICBUVl9ZID0gMSxcbiAgICBUVl9ZNyA9IDIsXG4gICAgVFZfRyA9IDMsXG4gICAgVFZfUEcgPSA0LFxuICAgIFRWXzE0ID0gNSxcbiAgICBUVl9NQSA9IDYsXG4gICAgTm90UmF0ZWQgPSA3XG59XG5cbmNvbnN0IGVudW0gTW92aWVSYXRpbmcge1xuICAgIE5vdEF2YWlsYWJsZSA9IC0xLFxuICAgIE5vdEFwcGxpY2FibGUgPSAwLFxuICAgIEcgPSAxLFxuICAgIFBHID0gMixcbiAgICBQR18xMyA9IDMsXG4gICAgUiA9IDQsXG4gICAgTkNfMTcgPSA1LFxuICAgIFggPSA2LFxuICAgIE5vdFJhdGVkID0gN1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFRodW1iIHtcbiAgICB3aWR0aDogbnVtYmVyO1xuICAgIHByZWZpeDogc3RyaW5nO1xuICAgIGhlaWdodDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN0b3JhZ2VQYXJpdGlvbiB7XG4gICAgLyoqXG4gICAgICogU3RhcnRpbmcgc2xpY2UgbnVtYmVyLCBpbmNsdXNpdmVcbiAgICAgKi9cbiAgICBzdGFydDogbnVtYmVyO1xuXG4gICAgLyoqXG4gICAgICogRW5kaW5nIHNsaWNlIG51bWJlciwgZXhjbHVzaXZlXG4gICAgICovXG4gICAgZW5kOiBudW1iZXI7XG4gICAgdXJsOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBBc3NldEluZm9TZXJpYWxpemVkIHtcbiAgICBhdWRpb19vbmx5OiBudW1iZXI7XG4gICAgZXJyb3I6IG51bWJlcjtcbiAgICB0dl9yYXRpbmc6IG51bWJlcjtcbiAgICBzdG9yYWdlX3BhcnRpdGlvbnM6IFN0b3JhZ2VQYXJpdGlvbltdO1xuICAgIG1heF9zbGljZTogbnVtYmVyO1xuICAgIHRodW1iX3ByZWZpeDogc3RyaW5nO1xuICAgIGFkX2RhdGE6IE9iamVjdDtcbiAgICBzbGljZV9kdXI6IG51bWJlcjtcbiAgICBtb3ZpZV9yYXRpbmc6IG51bWJlcjtcbiAgICBvd25lcjogc3RyaW5nO1xuICAgIHJhdGVzOiBudW1iZXJbXTtcbiAgICB0aHVtYnM6IFRodW1iW107XG4gICAgcG9zdGVyX3VybDogc3RyaW5nO1xuICAgIGR1cmF0aW9uOiBudW1iZXI7XG4gICAgZGVmYXVsdF9wb3N0ZXJfdXJsOiBzdHJpbmc7XG4gICAgZGVzYzogc3RyaW5nO1xuICAgIHJhdGluZ19mbGFnczogbnVtYmVyO1xuICAgIGV4dGVybmFsX2lkOiBzdHJpbmc7XG4gICAgaXNfYWQ6IG51bWJlcjtcbiAgICBhc3NldDogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgQWREYXRhIHtcbiAgICBjbGljaz86IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgY2xhc3MgQXNzZXRJbmZvIHtcbiAgICByZWFkb25seSBhdWRpb09ubHk6IGJvb2xlYW47XG4gICAgcmVhZG9ubHkgZXJyb3I6IGJvb2xlYW47XG4gICAgcmVhZG9ubHkgdHZSYXRpbmc6IFR2UmF0aW5nO1xuICAgIHJlYWRvbmx5IHN0b3JhZ2VQYXJ0aXRpb25zOiBTdG9yYWdlUGFyaXRpb25bXTtcbiAgICByZWFkb25seSBtYXhTbGljZTogbnVtYmVyO1xuICAgIHJlYWRvbmx5IHRodW1iUHJlZml4OiBzdHJpbmc7XG4gICAgcmVhZG9ubHkgYWREYXRhOiBBZERhdGE7XG4gICAgcmVhZG9ubHkgc2xpY2VEdXJhdGlvbjogbnVtYmVyO1xuICAgIHJlYWRvbmx5IG1vdmllUmF0aW5nOiBNb3ZpZVJhdGluZztcbiAgICByZWFkb25seSBvd25lcjogc3RyaW5nO1xuICAgIHJlYWRvbmx5IHJhdGVzOiBudW1iZXJbXTtcbiAgICByZWFkb25seSB0aHVtYnM6IFRodW1iW107XG4gICAgcmVhZG9ubHkgcG9zdGVyVXJsOiBzdHJpbmc7XG4gICAgcmVhZG9ubHkgZHVyYXRpb246IG51bWJlcjtcbiAgICByZWFkb25seSBkZWZhdWx0UG9zdGVyVXJsOiBzdHJpbmc7XG4gICAgcmVhZG9ubHkgZGVzY3JpcHRpb246IHN0cmluZztcbiAgICByZWFkb25seSByYXRpbmdGbGFnczogbnVtYmVyO1xuICAgIHJlYWRvbmx5IGV4dGVybmFsSWQ6IHN0cmluZztcbiAgICByZWFkb25seSBpc0FkOiBib29sZWFuO1xuICAgIHJlYWRvbmx5IGFzc2V0OiBzdHJpbmc7XG5cbiAgICBjb25zdHJ1Y3RvcihvYmo6IEFzc2V0SW5mb1NlcmlhbGl6ZWQsIGlzQWQ6IGJvb2xlYW4gfCBudWxsKSB7XG4gICAgICAgIHRoaXMuYXVkaW9Pbmx5ID0gb2JqLmF1ZGlvX29ubHkgPT0gMTtcbiAgICAgICAgdGhpcy5lcnJvciA9IG9iai5lcnJvciA9PSAxO1xuICAgICAgICB0aGlzLnR2UmF0aW5nID0gb2JqLnR2X3JhdGluZztcbiAgICAgICAgdGhpcy5zdG9yYWdlUGFydGl0aW9ucyA9IG9iai5zdG9yYWdlX3BhcnRpdGlvbnM7XG4gICAgICAgIHRoaXMubWF4U2xpY2UgPSBvYmoubWF4X3NsaWNlO1xuICAgICAgICB0aGlzLnRodW1iUHJlZml4ID0gb2JqLnRodW1iX3ByZWZpeDtcbiAgICAgICAgdGhpcy5hZERhdGEgPSBvYmouYWRfZGF0YTtcbiAgICAgICAgdGhpcy5zbGljZUR1cmF0aW9uID0gb2JqLnNsaWNlX2R1cjtcbiAgICAgICAgdGhpcy5tb3ZpZVJhdGluZyA9IG9iai5tb3ZpZV9yYXRpbmc7XG4gICAgICAgIHRoaXMub3duZXIgPSBvYmoub3duZXI7XG4gICAgICAgIHRoaXMucmF0ZXMgPSBvYmoucmF0ZXM7XG4gICAgICAgIHRoaXMudGh1bWJzID0gb2JqLnRodW1icztcbiAgICAgICAgdGhpcy5wb3N0ZXJVcmwgPSBvYmoucG9zdGVyX3VybDtcbiAgICAgICAgdGhpcy5kdXJhdGlvbiA9IG9iai5kdXJhdGlvbjtcbiAgICAgICAgdGhpcy5kZWZhdWx0UG9zdGVyVXJsID0gb2JqLmRlZmF1bHRfcG9zdGVyX3VybDtcbiAgICAgICAgdGhpcy5kZXNjcmlwdGlvbiA9IG9iai5kZXNjO1xuICAgICAgICB0aGlzLnJhdGluZ0ZsYWdzID0gb2JqLnJhdGluZ19mbGFncztcbiAgICAgICAgdGhpcy5leHRlcm5hbElkID0gb2JqLmV4dGVybmFsX2lkO1xuICAgICAgICB0aGlzLmFzc2V0ID0gb2JqLmFzc2V0O1xuXG4gICAgICAgIC8vdXNlIHZhbHVlIGZyb20gU2VnbWVudE1hcCBpZiBhdmFpbGFibGUgKCMxMTgsIFVQLTQzNTQpXG4gICAgICAgIGlmIChpc0FkID09IG51bGwpIHtcbiAgICAgICAgICAgIHRoaXMuaXNBZCA9IG9iai5pc19hZCA9PT0gMTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuaXNBZCA9IGlzQWQ7XG4gICAgICAgIH1cblxuICAgICAgICAvL3NvcnQgdGh1bWJzIGJ5IGltYWdlIHdpZHRoLCBzbWFsbGVzdCB0byBsYXJnZXN0XG4gICAgICAgIC8vIHRodW1icyBtYXkgYmUgdW5kZWZpbmVkIHdoZW4gcGxheWluZyBhbiBhdWRpby1vbmx5IGFzc2V0XG4gICAgICAgIGlmICh0aGlzLnRodW1icykge1xuICAgICAgICAgICAgdGhpcy50aHVtYnMuc29ydChmdW5jdGlvbiAobGVmdDogVGh1bWIsIHJpZ2h0OiBUaHVtYikge1xuICAgICAgICAgICAgICAgIHJldHVybiBsZWZ0LndpZHRoIC0gcmlnaHQud2lkdGg7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vY2xhbXAgc3RvcmFnZSBwYXJ0aXRpb24gc2xpY2UgZW5kIG51bWJlcnMgYXMgdGhleSBjYW4gYmUgbGFyZ2VyIHRoYW5cbiAgICAgICAgLy8gamF2YXNjcmlwdCBjYW4gc2FmZWx5IHJlcHJlc2VudFxuICAgICAgICBpZiAodGhpcy5zdG9yYWdlUGFydGl0aW9ucyAmJiB0aGlzLnN0b3JhZ2VQYXJ0aXRpb25zLmxlbmd0aCkge1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLnN0b3JhZ2VQYXJ0aXRpb25zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgLy9OdW1iZXIuTUFYX1NBRkVfSU5URUdFUiA9PT0gOTAwNzE5OTI1NDc0MDk5MVxuICAgICAgICAgICAgICAgIC8vTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIgbm90IHN1cHBvcnRlZCBpbiBJRVxuICAgICAgICAgICAgICAgIHRoaXMuc3RvcmFnZVBhcnRpdGlvbnNbaV0uZW5kID0gTWF0aC5taW4odGhpcy5zdG9yYWdlUGFydGl0aW9uc1tpXS5lbmQsIDkwMDcxOTkyNTQ3NDA5OTEpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxufVxuXG5leHBvcnQgY2xhc3MgQXNzZXRJbmZvU2VydmljZSB7XG4gICAgcHJpdmF0ZSByZWFkb25seSBfcHJvdG9jb2w6IHN0cmluZztcbiAgICBwcml2YXRlIHJlYWRvbmx5IF9kb21haW46IHN0cmluZztcbiAgICBwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uSWQ6IHN0cmluZztcbiAgICBwcml2YXRlIHJlYWRvbmx5IF9jYWNoZTogU3RyaW5nTWFwPEFzc2V0SW5mbz47XG5cbiAgICBjb25zdHJ1Y3Rvcihwcm90b2NvbDogc3RyaW5nLCBkb21haW46IHN0cmluZywgc2Vzc2lvbklkPzogc3RyaW5nKSB7XG4gICAgICAgIHRoaXMuX3Byb3RvY29sID0gcHJvdG9jb2w7XG4gICAgICAgIHRoaXMuX2RvbWFpbiA9IGRvbWFpbjtcbiAgICAgICAgdGhpcy5fc2Vzc2lvbklkID0gc2Vzc2lvbklkO1xuICAgICAgICB0aGlzLl9jYWNoZSA9IG5ldyBTdHJpbmdNYXA8QXNzZXRJbmZvPigpO1xuXG4gICAgICAgIHRoaXMuX2xvYWRTZWdtZW50cyA9IHRoaXMuX2xvYWRTZWdtZW50cy5iaW5kKHRoaXMpO1xuICAgIH1cblxuICAgIGxvYWRTZWdtZW50TWFwKHNlZ21lbnRNYXA6IFNlZ21lbnRNYXAsIGNhbGxiYWNrOiAoKSA9PiB2b2lkKTogdm9pZCB7XG4gICAgICAgIGlmICghc2VnbWVudE1hcCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IHNlZ21lbnRzOiBTZWdtZW50W10gPSBbXTtcblxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHNlZ21lbnRNYXAubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGxldCBzZWdtZW50ID0gc2VnbWVudE1hcC5nZXRTZWdtZW50QXQoaSk7XG4gICAgICAgICAgICBpZiAoc2VnbWVudC5pZCAmJiBzZWdtZW50LmlkICE9PSAnJykge1xuICAgICAgICAgICAgICAgIHNlZ21lbnRzLnB1c2goc2VnbWVudCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9sb2FkU2VnbWVudHMoc2VnbWVudHMsIGNhbGxiYWNrKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9sb2FkU2VnbWVudHMoc2VnbWVudHM6IFNlZ21lbnRbXSwgY2FsbGJhY2s6ICgpID0+IHZvaWQpOiB2b2lkIHtcbiAgICAgICAgaWYgKHNlZ21lbnRzLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IHNlZ21lbnQgPSBzZWdtZW50cy5zaGlmdCgpO1xuICAgICAgICB0aGlzLmxvYWRTZWdtZW50KHNlZ21lbnQsICgpID0+IHtcbiAgICAgICAgICAgIHRoaXMuX2xvYWRTZWdtZW50cyhzZWdtZW50cywgY2FsbGJhY2spO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBsb2FkQXNzZXRJZChhc3NldElkOiBzdHJpbmcsIGlzQWQ6IGJvb2xlYW4gfCBudWxsLCBjYWxsQmFjazogKGFzc2V0SW5mbzogQXNzZXRJbmZvKSA9PiB2b2lkKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLmlzTG9hZGVkKGFzc2V0SWQpKSB7XG4gICAgICAgICAgICAvL2Fzc2V0SW5mbyBmb3IgYXNzZXRJZCBpcyBhbHJlYWR5IGxvYWRlZFxuICAgICAgICAgICAgbGV0IGluZm8gPSB0aGlzLl9jYWNoZS5nZXQoYXNzZXRJZCk7XG4gICAgICAgICAgICBjYWxsQmFjayhpbmZvKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCB1cmwgPSBgJHt0aGlzLl9wcm90b2NvbH0vLyR7dGhpcy5fZG9tYWlufS9wbGF5ZXIvYXNzZXRpbmZvLyR7YXNzZXRJZH0uanNvbmA7XG5cbiAgICAgICAgaWYgKHRoaXMuX3Nlc3Npb25JZCAmJiB0aGlzLl9zZXNzaW9uSWQgIT0gXCJcIikge1xuICAgICAgICAgICAgdXJsID0gYCR7dXJsfT9wYnM9JHt0aGlzLl9zZXNzaW9uSWR9YDtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciB4aHIgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcbiAgICAgICAgeGhyLm9ubG9hZGVuZCA9ICgpOiB2b2lkID0+IHtcbiAgICAgICAgICAgIGlmICh4aHIuc3RhdHVzID09IDIwMCkge1xuICAgICAgICAgICAgICAgIGxldCBvYmogPSBKU09OLnBhcnNlKHhoci5yZXNwb25zZVRleHQpO1xuICAgICAgICAgICAgICAgIGxldCBhc3NldEluZm8gPSBuZXcgQXNzZXRJbmZvKG9iaiwgaXNBZCk7XG5cbiAgICAgICAgICAgICAgICAvL2FkZCBhc3NldEluZm8gdG8gY2FjaGVcbiAgICAgICAgICAgICAgICB0aGlzLl9jYWNoZS5zZXQoYXNzZXRJZCwgYXNzZXRJbmZvKTtcblxuICAgICAgICAgICAgICAgIGNhbGxCYWNrKGFzc2V0SW5mbyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNhbGxCYWNrKG51bGwpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIHhoci5vcGVuKFwiR0VUXCIsIHVybCk7XG4gICAgICAgIHhoci5zZW5kKCk7XG4gICAgfVxuXG4gICAgbG9hZFNlZ21lbnQoc2VnbWVudDogU2VnbWVudCwgY2FsbEJhY2s6IChhc3NldEluZm86IEFzc2V0SW5mbykgPT4gdm9pZCk6IHZvaWQge1xuICAgICAgICBjb25zdCBhc3NldElkOiBzdHJpbmcgPSBzZWdtZW50LmlkO1xuICAgICAgICBjb25zdCBpc0FkID0gU2VnbWVudE1hcC5pc0FkKHNlZ21lbnQpO1xuXG4gICAgICAgIHRoaXMubG9hZEFzc2V0SWQoYXNzZXRJZCwgaXNBZCwgY2FsbEJhY2spO1xuICAgIH1cblxuICAgIGlzTG9hZGVkKGFzc2V0SWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5fY2FjaGUuaGFzKGFzc2V0SWQpO1xuICAgIH1cblxuICAgIGdldEFzc2V0SW5mbyhhc3NldElkOiBzdHJpbmcpOiBBc3NldEluZm8ge1xuICAgICAgICBpZiAodGhpcy5pc0xvYWRlZChhc3NldElkKSkge1xuICAgICAgICAgICAgbGV0IGluZm8gPSB0aGlzLl9jYWNoZS5nZXQoYXNzZXRJZCk7XG4gICAgICAgICAgICByZXR1cm4gaW5mbztcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgY2xlYXIoKTogdm9pZCB7XG4gICAgICAgIHRoaXMuX2NhY2hlLmNsZWFyKCk7XG4gICAgfVxufVxuIiwiZXhwb3J0IGNsYXNzIFBpbmdTZXJ2aWNlIHtcbiAgICBwcml2YXRlIHJlYWRvbmx5IF9wcm90b2NvbDogc3RyaW5nO1xuICAgIHByaXZhdGUgcmVhZG9ubHkgX2RvbWFpbjogc3RyaW5nO1xuICAgIHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25JZDogc3RyaW5nO1xuICAgIHByaXZhdGUgcmVhZG9ubHkgX3ZpZGVvOiBIVE1MVmlkZW9FbGVtZW50O1xuXG4gICAgcHJpdmF0ZSBfcGluZ1NlcnZlcjogYm9vbGVhbjtcbiAgICBwcml2YXRlIF9zZW50U3RhcnRQaW5nOiBib29sZWFuO1xuICAgIHByaXZhdGUgX3NlZWtpbmc6IGJvb2xlYW47XG5cbiAgICBwcml2YXRlIF9jdXJyZW50VGltZTogbnVtYmVyO1xuICAgIHByaXZhdGUgX3NlZWtGcm9tVGltZTogbnVtYmVyO1xuICAgIHByaXZhdGUgX25leHRUaW1lOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cbiAgICBwcml2YXRlIHJlYWRvbmx5IFNUQVJUID0gXCJzdGFydFwiO1xuICAgIHByaXZhdGUgcmVhZG9ubHkgU0VFSyA9IFwic2Vla1wiO1xuXG4gICAgY29uc3RydWN0b3IocHJvdG9jb2w6IHN0cmluZywgZG9tYWluOiBzdHJpbmcsIHNlc3Npb25JZDogc3RyaW5nLCB2aWRlbzogSFRNTFZpZGVvRWxlbWVudCkge1xuXG4gICAgICAgIHRoaXMuX3Byb3RvY29sID0gcHJvdG9jb2w7XG4gICAgICAgIHRoaXMuX2RvbWFpbiA9IGRvbWFpbjtcbiAgICAgICAgdGhpcy5fc2Vzc2lvbklkID0gc2Vzc2lvbklkO1xuICAgICAgICB0aGlzLl92aWRlbyA9IHZpZGVvO1xuXG4gICAgICAgIHRoaXMuX3BpbmdTZXJ2ZXIgPSBzZXNzaW9uSWQgIT0gbnVsbCAmJiBzZXNzaW9uSWQgIT0gXCJcIjtcbiAgICAgICAgdGhpcy5fbmV4dFRpbWUgPSB1bmRlZmluZWQ7XG5cbiAgICAgICAgdGhpcy5fc2VudFN0YXJ0UGluZyA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9zZWVraW5nID0gZmFsc2U7XG5cbiAgICAgICAgdGhpcy5fY3VycmVudFRpbWUgPSAwLjA7XG4gICAgICAgIHRoaXMuX3NlZWtGcm9tVGltZSA9IDAuMDtcblxuICAgICAgICB0aGlzLl92aWRlbyA9IHZpZGVvO1xuXG4gICAgICAgIHRoaXMuX29uUGxheWVyUG9zaXRpb25DaGFuZ2VkID0gdGhpcy5fb25QbGF5ZXJQb3NpdGlvbkNoYW5nZWQuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5fb25TdGFydCA9IHRoaXMuX29uU3RhcnQuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5fb25TZWVrZWQgPSB0aGlzLl9vblNlZWtlZC5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLl9vblNlZWtpbmcgPSB0aGlzLl9vblNlZWtpbmcuYmluZCh0aGlzKTtcblxuICAgICAgICBpZiAodGhpcy5fcGluZ1NlcnZlcikge1xuICAgICAgICAgICAgdGhpcy5fdmlkZW8uYWRkRXZlbnRMaXN0ZW5lcigndGltZXVwZGF0ZScsIHRoaXMuX29uUGxheWVyUG9zaXRpb25DaGFuZ2VkKTtcbiAgICAgICAgICAgIHRoaXMuX3ZpZGVvLmFkZEV2ZW50TGlzdGVuZXIoJ3BsYXlpbmcnLCB0aGlzLl9vblN0YXJ0KTtcbiAgICAgICAgICAgIHRoaXMuX3ZpZGVvLmFkZEV2ZW50TGlzdGVuZXIoJ3NlZWtlZCcsIHRoaXMuX29uU2Vla2VkKTtcbiAgICAgICAgICAgIHRoaXMuX3ZpZGVvLmFkZEV2ZW50TGlzdGVuZXIoJ3NlZWtpbmcnLCB0aGlzLl9vblNlZWtpbmcpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfY3JlYXRlUXVlcnlTdHJpbmcoZXZlbnQ6IHN0cmluZywgY3VycmVudFBvc2l0aW9uOiBudW1iZXIsIGZyb21Qb3NpdGlvbj86IG51bWJlcikge1xuICAgICAgICBjb25zdCBWRVJTSU9OID0gMztcblxuICAgICAgICBpZiAoZXZlbnQpIHtcbiAgICAgICAgICAgIGxldCBzdHIgPSBgdj0ke1ZFUlNJT059JmV2PSR7ZXZlbnR9JnB0PSR7Y3VycmVudFBvc2l0aW9ufWA7XG5cbiAgICAgICAgICAgIGlmIChmcm9tUG9zaXRpb24pIHtcbiAgICAgICAgICAgICAgICBzdHIgKz0gYCZmdD0ke2Zyb21Qb3NpdGlvbn1gO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gc3RyO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGB2PSR7VkVSU0lPTn0mcHQ9JHtjdXJyZW50UG9zaXRpb259YDtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vblN0YXJ0KCkge1xuICAgICAgICBpZiAodGhpcy5fcGluZ1NlcnZlciAmJiAhdGhpcy5fc2VudFN0YXJ0UGluZykge1xuICAgICAgICAgICAgdGhpcy5fc2VuZFBpbmcodGhpcy5TVEFSVCwgMCk7XG4gICAgICAgICAgICB0aGlzLl9zZW50U3RhcnRQaW5nID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgX29uU2Vla2luZygpIHtcbiAgICAgICAgdGhpcy5fc2Vla2luZyA9IHRydWU7XG4gICAgICAgIHRoaXMuX25leHRUaW1lID0gdW5kZWZpbmVkO1xuICAgICAgICB0aGlzLl9zZWVrRnJvbVRpbWUgPSB0aGlzLl9jdXJyZW50VGltZTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vblNlZWtlZCgpIHtcbiAgICAgICAgaWYgKHRoaXMuX3BpbmdTZXJ2ZXIgJiYgdGhpcy5fc2Vla2luZyAmJiB0aGlzLl9zZWVrRnJvbVRpbWUpIHtcbiAgICAgICAgICAgIHRoaXMuX3NlbmRQaW5nKHRoaXMuU0VFSywgdGhpcy5fY3VycmVudFRpbWUsIHRoaXMuX3NlZWtGcm9tVGltZSk7XG4gICAgICAgICAgICB0aGlzLl9zZWVraW5nID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLl9zZWVrRnJvbVRpbWUgPSB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIF9vblBsYXllclBvc2l0aW9uQ2hhbmdlZCgpIHtcbiAgICAgICAgdGhpcy5fY3VycmVudFRpbWUgPSB0aGlzLl92aWRlby5jdXJyZW50VGltZTtcblxuICAgICAgICBpZiAodGhpcy5fcGluZ1NlcnZlciAmJiAhdGhpcy5fc2Vla2luZyAmJiB0aGlzLl9uZXh0VGltZSAmJiB0aGlzLl9jdXJyZW50VGltZSA+IHRoaXMuX25leHRUaW1lKSB7XG4gICAgICAgICAgICB0aGlzLl9uZXh0VGltZSA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIHRoaXMuX3NlbmRQaW5nKG51bGwsIHRoaXMuX2N1cnJlbnRUaW1lKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgX3NlbmRQaW5nKGV2ZW50OiBzdHJpbmcsIGN1cnJlbnRQb3NpdGlvbjogbnVtYmVyLCBmcm9tUG9zaXRpb24/OiBudW1iZXIpIHtcbiAgICAgICAgbGV0IHVybCA9IGAke3RoaXMuX3Byb3RvY29sfS8vJHt0aGlzLl9kb21haW59L3Nlc3Npb24vcGluZy8ke3RoaXMuX3Nlc3Npb25JZH0uanNvbj8ke3RoaXMuX2NyZWF0ZVF1ZXJ5U3RyaW5nKGV2ZW50LCBjdXJyZW50UG9zaXRpb24sIGZyb21Qb3NpdGlvbil9YDtcblxuICAgICAgICB2YXIgeGhyID0gbmV3IFhNTEh0dHBSZXF1ZXN0KCk7XG4gICAgICAgIHhoci5vcGVuKFwiR0VUXCIsIHVybCwgdHJ1ZSk7XG4gICAgICAgIHhoci5yZXNwb25zZVR5cGUgPSBcInRleHRcIjtcblxuICAgICAgICB4aHIub25sb2FkID0gKCkgPT4ge1xuICAgICAgICAgICAgaWYgKHhoci5zdGF0dXMgPT09IDIwMCkge1xuICAgICAgICAgICAgICAgIGxldCBqc29uID0gSlNPTi5wYXJzZSh4aHIucmVzcG9uc2VUZXh0KTtcbiAgICAgICAgICAgICAgICB0aGlzLl9uZXh0VGltZSA9IGpzb24ubmV4dF90aW1lO1xuXG4gICAgICAgICAgICAgICAgLy9hYnNlbmNlIG9mIGVycm9yIHByb3BlcnR5IGluZGljYXRlcyBubyBlcnJvclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLl9uZXh0VGltZSA8IDAgfHwganNvbi5oYXNPd25Qcm9wZXJ0eSgnZXJyb3InKSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9waW5nU2VydmVyID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX25leHRUaW1lID0gdW5kZWZpbmVkO1xuXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3ZpZGVvLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3RpbWV1cGRhdGUnLCB0aGlzLl9vblBsYXllclBvc2l0aW9uQ2hhbmdlZCk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3ZpZGVvLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3BsYXlpbmcnLCB0aGlzLl9vblN0YXJ0KTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fdmlkZW8ucmVtb3ZlRXZlbnRMaXN0ZW5lcignc2Vla2VkJywgdGhpcy5fb25TZWVrZWQpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl92aWRlby5yZW1vdmVFdmVudExpc3RlbmVyKCdzZWVraW5nJywgdGhpcy5fb25TZWVraW5nKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgeGhyLnNlbmQoKTtcbiAgICB9XG59Il19
