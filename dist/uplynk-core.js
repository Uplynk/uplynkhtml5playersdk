(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";
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
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var observable_1 = require('./utils/observable');
var asset_info_service_1 = require('./web-services/asset-info-service');
var ping_service_1 = require('./web-services/ping-service');
var id3_handler_1 = require('./id3/id3-handler');
var segment_map_1 = require('./utils/segment-map');
var thumb = require('./utils/thumbnail-helper');
var events_1 = require('./events');
var utils_1 = require('./utils/utils');
var license_manager_1 = require('./license-manager');
var utils_2 = require('./utils/utils');
var AdaptivePlayer = (function (_super) {
    __extends(AdaptivePlayer, _super);
    function AdaptivePlayer(video, options) {
        _super.call(this);
        this._defaults = {
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
        this._config = Object.assign({}, this._defaults, options, data);
        this._video = video;
        this._id3Handler = new id3_handler_1.ID3Handler(video);
        this._id3Handler.on(id3_handler_1.ID3Handler.Event.ID3Tag, this._onID3Tag.bind(this));
        this._id3Handler.on(id3_handler_1.ID3Handler.Event.TxxxID3Frame, this._onTxxxID3Frame.bind(this));
        this._id3Handler.on(id3_handler_1.ID3Handler.Event.PrivID3Frame, this._onPrivID3Frame.bind(this));
        this._id3Handler.on(id3_handler_1.ID3Handler.Event.TextID3Frame, this._onTextID3Frame.bind(this));
        this._id3Handler.on(id3_handler_1.ID3Handler.Event.SliceEntered, this._onSliceEntered.bind(this));
        this._onVideoTimeUpdate = this._onVideoTimeUpdate.bind(this);
        this._onVideoSeeking = this._onVideoSeeking.bind(this);
        this._onVideoSeeked = this._onVideoSeeked.bind(this);
        this._onMediaSourceOpen = this._onMediaSourceOpen.bind(this);
        this._onVideoPlaybackEnd = this._onVideoPlaybackEnd.bind(this);
        this._onTimerTick = this._onTimerTick.bind(this);
        this._isSafari = false;
        this._isIE = false;
        this._isFirefox = false;
        this._isChrome = false;
        this._firedReadyEvent = false;
        this._ended = false;
        this._usingCustomUI = false;
        this._intervalId = 0;
        this._overrideCurrentTime();
        this._overrideEnded();
    }
    AdaptivePlayer.prototype._overrideCurrentTime = function () {
        var getCurrentTime = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime').get;
        var setCurrentTime = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime').set;
        var self = this;
        Object.defineProperty(this._video, 'currentTime', {
            get: function () {
                return getCurrentTime.apply(this);
            },
            set: function (val) {
                if (self.canSeek()) {
                    self._ended = false;
                    var actualTime = self.getSeekTime(val);
                    setCurrentTime.apply(this, [actualTime]);
                }
            },
            enumerable: false,
            configurable: false,
        });
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
        this._adaptiveSource.seek(this._video.currentTime);
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
        this._assetInfoService = new asset_info_service_1.AssetInfoService(this._adaptiveSource.domain, this._adaptiveSource.sessionId);
        this._pingService = new ping_service_1.PingService(this._adaptiveSource.domain, this._adaptiveSource.sessionId, this._video);
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
        var _loop_1 = function(i) {
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
        var _loop_2 = function(i) {
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
    Object.defineProperty(AdaptivePlayer.prototype, "audioTracks", {
        get: function () {
            return this._adaptiveSource.audioTracks;
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
            return '02.00.17080800';
        },
        enumerable: true,
        configurable: true
    });
    return AdaptivePlayer;
}(observable_1.Observable));
exports.AdaptivePlayer = AdaptivePlayer;

},{"./events":3,"./id3/id3-handler":5,"./license-manager":6,"./utils/observable":12,"./utils/segment-map":13,"./utils/thumbnail-helper":15,"./utils/utils":16,"./web-services/asset-info-service":17,"./web-services/ping-service":18}],3:[function(require,module,exports){
"use strict";
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
    Ready: 'ready'
};

},{}],4:[function(require,module,exports){
"use strict";
var utils_1 = require('../utils/utils');
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
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var observable_1 = require('../utils/observable');
var id3_decoder_1 = require('./id3-decoder');
var utils_1 = require('../utils/utils');
var ID3Handler = (function (_super) {
    __extends(ID3Handler, _super);
    function ID3Handler(video) {
        _super.call(this);
        video.textTracks.addEventListener('addtrack', this._onAddTrack.bind(this));
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
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var observable_1 = require('./utils/observable');
var events_1 = require('./events');
var ad_break_1 = require('./ad/ad-break');
var id3_handler_1 = require('./id3/id3-handler');
var asset_info_service_1 = require('./web-services/asset-info-service');
var ping_service_1 = require('./web-services/ping-service');
var NativePlayer = (function (_super) {
    __extends(NativePlayer, _super);
    function NativePlayer(video, options) {
        _super.call(this);
        this._defaults = {
            disableSeekDuringAdBreak: true,
            showPoster: false,
            debug: false
        };
        var data = {};
        try {
            data = JSON.parse(video.getAttribute('data-config'));
        }
        catch (e) { }
        this._config = Object.assign({}, this._defaults, options, data);
        this._video = video;
        this._id3Handler = new id3_handler_1.ID3Handler(video);
        this._id3Handler.on(id3_handler_1.ID3Handler.Event.ID3Tag, this._onID3Tag.bind(this));
        this._id3Handler.on(id3_handler_1.ID3Handler.Event.TxxxID3Frame, this._onTxxxID3Frame.bind(this));
        this._id3Handler.on(id3_handler_1.ID3Handler.Event.PrivID3Frame, this._onPrivID3Frame.bind(this));
        this._id3Handler.on(id3_handler_1.ID3Handler.Event.TextID3Frame, this._onTextID3Frame.bind(this));
        this._id3Handler.on(id3_handler_1.ID3Handler.Event.SliceEntered, this._onSliceEntered.bind(this));
        this._onDurationChange = this._onDurationChange.bind(this);
        this._overrideCurrentTime();
    }
    NativePlayer.prototype.load = function (url) {
        this._firedReadyEvent = false;
        this._currentAssetId = null;
        this._video.removeEventListener('durationchange', this._onDurationChange);
        this._video.addEventListener('durationchange', this._onDurationChange);
        this._sessionId = this._getSessionId(url);
        this._domain = this._getDomain(url);
        this._assetInfoService = new asset_info_service_1.AssetInfoService(this.domain);
        if (this._domain !== 'content.uplynk.com') {
            this._pingService = new ping_service_1.PingService(this.domain, this._sessionId, this._video);
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
            return '02.00.17080800';
        },
        enumerable: true,
        configurable: true
    });
    return NativePlayer;
}(observable_1.Observable));
exports.NativePlayer = NativePlayer;

},{"./ad/ad-break":1,"./events":3,"./id3/id3-handler":5,"./utils/observable":12,"./web-services/asset-info-service":17,"./web-services/ping-service":18}],8:[function(require,module,exports){
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
require('./polyfill/vtt-cue');
require('./polyfill/object');
require('./polyfill/array');
var adaptive_player_1 = require('./adaptive-player');
var native_player_1 = require('./native-player');
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
var string_map_1 = require('./string-map');
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
var ad_break_1 = require('../ad/ad-break');
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
var utils_1 = require('./utils');
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

},{}],17:[function(require,module,exports){
"use strict";
var segment_map_1 = require('../utils/segment-map');
var string_map_1 = require('../utils/string-map');
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
    function AssetInfoService(domain, sessionId) {
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
        var url = "//" + this._domain + "/player/assetinfo/" + assetId + ".json";
        if (this._sessionId && this._sessionId != "") {
            url = url + "?pbs=" + this._sessionId;
        }
        var xhr = new XMLHttpRequest();
        xhr.onload = function () {
            if (xhr.status == 200) {
                var obj = JSON.parse(xhr.responseText);
                var assetInfo = new AssetInfo(obj, isAd);
                _this._cache.set(assetId, assetInfo);
                callBack(assetInfo);
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
var PingService = (function () {
    function PingService(domain, sessionId, video) {
        this.START = "start";
        this.SEEK = "seek";
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
        var url = "//" + this._domain + "/session/ping/" + this._sessionId + ".json?" + this._createQueryString(event, currentPosition, fromPosition);
        var xhr = new XMLHttpRequest();
        xhr.open("GET", url, true);
        xhr.responseType = "text";
        xhr.onload = function () {
            if (xhr.status == 200) {
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvdHMvYWQvYWQtYnJlYWsudHMiLCJzcmMvdHMvYWRhcHRpdmUtcGxheWVyLnRzIiwic3JjL3RzL2V2ZW50cy50cyIsInNyYy90cy9pZDMvaWQzLWRlY29kZXIudHMiLCJzcmMvdHMvaWQzL2lkMy1oYW5kbGVyLnRzIiwic3JjL3RzL2xpY2Vuc2UtbWFuYWdlci50cyIsInNyYy90cy9uYXRpdmUtcGxheWVyLnRzIiwic3JjL3RzL3BvbHlmaWxsL2FycmF5LnRzIiwic3JjL3RzL3BvbHlmaWxsL29iamVjdC50cyIsInNyYy90cy9wb2x5ZmlsbC92dHQtY3VlLnRzIiwic3JjL3RzL3VwbHluay1jb3JlLnRzIiwic3JjL3RzL3V0aWxzL29ic2VydmFibGUudHMiLCJzcmMvdHMvdXRpbHMvc2VnbWVudC1tYXAudHMiLCJzcmMvdHMvdXRpbHMvc3RyaW5nLW1hcC50cyIsInNyYy90cy91dGlscy90aHVtYm5haWwtaGVscGVyLnRzIiwic3JjL3RzL3V0aWxzL3V0aWxzLnRzIiwic3JjL3RzL3dlYi1zZXJ2aWNlcy9hc3NldC1pbmZvLXNlcnZpY2UudHMiLCJzcmMvdHMvd2ViLXNlcnZpY2VzL3Bpbmctc2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7QUNBQTtJQU9JLGlCQUFZLFFBQW1CO1FBQzNCLEVBQUUsQ0FBQyxDQUFDLFFBQVEsSUFBSSxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDbEMsSUFBSSxDQUFDLFNBQVMsR0FBRyxRQUFRLENBQUM7WUFDMUIsSUFBSSxDQUFDLE1BQU0sR0FBRyxRQUFRLENBQUMsTUFBTSxDQUFDO1lBQzlCLElBQUksQ0FBQyxTQUFTLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztZQUN2QyxJQUFJLENBQUMsT0FBTyxHQUFHLFFBQVEsQ0FBQyxRQUFRLENBQUMsTUFBTSxH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QyxtQkFBbUIsQ0FBQyxTQUFTLEVBQUUsS0FBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO2dCQUNoRSxDQUFDO1lBQ0wsQ0FBQztRQUNMLENBQUMsQ0FBQztRQUVGLEdBQUcsQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUNmLENBQUM7SUFDTCxrQkFBQztBQUFELENBdkhBLEFBdUhDLElBQUE7QUF2SFksbUJBQVcsY0F1SHZCLENBQUEiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiZXhwb3J0IGNsYXNzIEFkQnJlYWsge1xuICAgIHJlYWRvbmx5IHN0YXJ0VGltZTogbnVtYmVyO1xuICAgIHJlYWRvbmx5IGVuZFRpbWU6IG51bWJlcjtcbiAgICByZWFkb25seSBkdXJhdGlvbjogbnVtYmVyO1xuICAgIHJlYWRvbmx5IG51bUFkczogbnVtYmVyO1xuICAgIHByaXZhdGUgX3NlZ21lbnRzOiBTZWdtZW50W107XG5cbiAgICBjb25zdHJ1Y3RvcihzZWdtZW50czogU2VnbWVudFtdKSB7XG4gICAgICAgIGlmIChzZWdtZW50cyAmJiBzZWdtZW50cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICB0aGlzLl9zZWdtZW50cyA9IHNlZ21lbnRzO1xuICAgICAgICAgICAgdGhpcy5udW1BZHMgPSBzZWdtZW50cy5sZW5ndGg7XG4gICAgICAgICAgICB0aGlzLnN0YXJ0VGltZSA9IHNlZ21lbnRzWzBdLnN0YXJ0VGltZTtcbiAgICAgICAgICAgIHRoaXMuZW5kVGltZSA9IHNlZ21lbnRzW3NlZ21lbnRzLmxlbmd0aCAtIDFdLmVuZFRpbWU7XG4gICAgICAgICAgICB0aGlzLmR1cmF0aW9uID0gdGhpcy5lbmRUaW1lIC0gdGhpcy5zdGFydFRpbWU7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXRBZFBvc2l0aW9uQXQodGltZTogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9zZWdtZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgaWYgKHRoaXMuX3NlZ21lbnRzW2ldLnN0YXJ0VGltZSA8PSB0aW1lICYmIHRpbWUgPD0gdGhpcy5fc2VnbWVudHNbaV0uZW5kVGltZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBpICsgMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiAwO1xuICAgIH1cblxuICAgIGdldFNlZ21lbnRBdChpbmRleDogbnVtYmVyKTogU2VnbWVudCB7XG4gICAgICAgIGlmKHRoaXMuX3NlZ21lbnRzICYmIGluZGV4ID4gLTEgJiYgaW5kZXggPCB0aGlzLl9zZWdtZW50cy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9zZWdtZW50c1tpbmRleF07XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIGNvbnRhaW5zKHRpbWU6IG51bWJlcik6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5zdGFydFRpbWUgPD0gdGltZSAmJiB0aW1lIDw9IHRoaXMuZW5kVGltZTtcbiAgICB9XG59IiwiaW1wb3J0IHsgT2JzZXJ2YWJsZSB9IGZyb20gJy4vdXRpbHMvb2JzZXJ2YWJsZSc7XG5pbXBvcnQgeyBBc3NldEluZm8sIEFzc2V0SW5mb1NlcnZpY2UgfSBmcm9tICcuL3dlYi1zZXJ2aWNlcy9hc3NldC1pbmZvLXNlcnZpY2UnO1xuaW1wb3J0IHsgUGluZ1NlcnZpY2UgfSBmcm9tICcuL3dlYi1zZXJ2aWNlcy9waW5nLXNlcnZpY2UnO1xuaW1wb3J0IHsgSUQzSGFuZGxlciwgSUQzVGFnRXZlbnQsIFR4eHhJRDNGcmFtZUV2ZW50LCBQcml2SUQzRnJhbWVFdmVudCwgVGV4dElEM0ZyYW1lRXZlbnQsIFNsaWNlRXZlbnQgfSBmcm9tICcuL2lkMy9pZDMtaGFuZGxlcic7XG5pbXBvcnQgeyBJRDNEYXRhIH0gZnJvbSAnLi9pZDMvaWQzLWRhdGEnO1xuaW1wb3J0IHsgU2VnbWVudE1hcCB9IGZyb20gJy4vdXRpbHMvc2VnbWVudC1tYXAnO1xuaW1wb3J0ICogYXMgdGh1bWIgZnJvbSAnLi91dGlscy90aHVtYm5haWwtaGVscGVyJztcbmltcG9ydCB7IEFkQnJlYWsgfSBmcm9tICcuL2FkL2FkLWJyZWFrJztcbmltcG9ydCB7IEV2ZW50cyB9IGZyb20gJy4vZXZlbnRzJztcbmltcG9ydCB7IFBsYXllciwgUmVzb2x1dGlvbiwgTWltZVR5cGUgfSBmcm9tICcuL3BsYXllcic7XG5pbXBvcnQgeyBpc0xvY2FsU3RvcmFnZUF2YWlsYWJsZSB9IGZyb20gJy4vdXRpbHMvdXRpbHMnO1xuaW1wb3J0IHsgTGljZW5zZU1hbmFnZXIgfSBmcm9tICcuL2xpY2Vuc2UtbWFuYWdlcic7XG5pbXBvcnQgeyBiYXNlNjRUb0J1ZmZlciB9IGZyb20gJy4vdXRpbHMvdXRpbHMnO1xuXG5leHBvcnQgY2xhc3MgQWRhcHRpdmVQbGF5ZXIgZXh0ZW5kcyBPYnNlcnZhYmxlIGltcGxlbWVudHMgUGxheWVyIHtcbiAgICBwcml2YXRlIF92aWRlbzogSFRNTFZpZGVvRWxlbWVudDtcbiAgICBwcml2YXRlIF9hZGFwdGl2ZVNvdXJjZTogTW9kdWxlLkFkYXB0aXZlU291cmNlO1xuICAgIHByaXZhdGUgX21lZGlhU291cmNlOiBNZWRpYVNvdXJjZTtcbiAgICBwcml2YXRlIF91cmw6IHN0cmluZztcbiAgICBwcml2YXRlIF9vYmplY3RVcmw6IHN0cmluZztcbiAgICBwcml2YXRlIF9hc3NldEluZm9TZXJ2aWNlOiBBc3NldEluZm9TZXJ2aWNlO1xuICAgIHByaXZhdGUgX3BpbmdTZXJ2aWNlOiBQaW5nU2VydmljZTtcbiAgICBwcml2YXRlIF9pZDNIYW5kbGVyOiBJRDNIYW5kbGVyO1xuICAgIHByaXZhdGUgX3NlZ21lbnRNYXA6IFNlZ21lbnRNYXA7XG4gICAgcHJpdmF0ZSBfY29uZmlnOiBQbGF5ZXJPcHRpb25zO1xuICAgIHByaXZhdGUgX2ZpcmVkUmVhZHlFdmVudDogYm9vbGVhbjtcbiAgICBwcml2YXRlIF9pc1NhZmFyaTogYm9vbGVhbjtcbiAgICBwcml2YXRlIF9pc0ZpcmVmb3g6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSBfaXNDaHJvbWU6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSBfaXNJRTogYm9vbGVhbjtcbiAgICBwcml2YXRlIF9pc1BhdXNlZDogYm9vbGVhbjtcbiAgICBwcml2YXRlIF90YXJnZXRUaW1lOiBudW1iZXI7XG4gICAgcHJpdmF0ZSBfZm9yY2VkQWRCcmVhazogQWRCcmVhaztcbiAgICBwcml2YXRlIF92aWRlb1JlY3Q6IENsaWVudFJlY3Q7XG4gICAgcHJpdmF0ZSBfZW5kZWQ6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSBfdXNpbmdDdXN0b21VSTogYm9vbGVhbjtcbiAgICBwcml2YXRlIF9pbnRlcnZhbElkOiBudW1iZXI7XG4gICAgcHJpdmF0ZSBfbGljZW5zZU1hbmFnZXI6IExpY2Vuc2VNYW5hZ2VyO1xuXG5cbiAgICBwcml2YXRlIHJlYWRvbmx5IF9kZWZhdWx0czogUGxheWVyT3B0aW9ucyA9IHtcbiAgICAgICAgZGlzYWJsZVNlZWtEdXJpbmdBZEJyZWFrOiB0cnVlLFxuICAgICAgICBzaG93UG9zdGVyOiBmYWxzZSxcbiAgICAgICAgZGVidWc6IGZhbHNlLFxuICAgICAgICBsaW1pdFJlc29sdXRpb25Ub1ZpZXdTaXplOiBmYWxzZSxcbiAgICB9O1xuXG4gICAgY29uc3RydWN0b3IodmlkZW86IEhUTUxWaWRlb0VsZW1lbnQsIG9wdGlvbnM/OiBQbGF5ZXJPcHRpb25zKSB7XG4gICAgICAgIHN1cGVyKCk7XG5cbiAgICAgICAgLy9pbml0IGNvbmZpZ1xuICAgICAgICB2YXIgZGF0YSA9IHt9O1xuXG4gICAgICAgIC8vdHJ5IHBhcnNpbmcgZGF0YSBhdHRyaWJ1dGUgY29uZmlnXG4gICAgICAgIHRyeSB7IGRhdGEgPSBKU09OLnBhcnNlKHZpZGVvLmdldEF0dHJpYnV0ZSgnZGF0YS1jb25maWcnKSk7IH1cbiAgICAgICAgY2F0Y2ggKGUpIHsgfVxuXG4gICAgICAgIC8vbWVyZ2UgZGVmYXVsdHMgd2l0aCB1c2VyIG9wdGlvbnNcbiAgICAgICAgdGhpcy5fY29uZmlnID0gT2JqZWN0LmFzc2lnbih7fSwgdGhpcy5fZGVmYXVsdHMsIG9wdGlvbnMsIGRhdGEpO1xuXG4gICAgICAgIHRoaXMuX3ZpZGVvID0gdmlkZW87XG4gICAgICAgIHRoaXMuX2lkM0hhbmRsZXIgPSBuZXcgSUQzSGFuZGxlcih2aWRlbyk7XG4gICAgICAgIHRoaXMuX2lkM0hhbmRsZXIub24oSUQzSGFuZGxlci5FdmVudC5JRDNUYWcsIHRoaXMuX29uSUQzVGFnLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLl9pZDNIYW5kbGVyLm9uKElEM0hhbmRsZXIuRXZlbnQuVHh4eElEM0ZyYW1lLCB0aGlzLl9vblR4eHhJRDNGcmFtZS5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5faWQzSGFuZGxlci5vbihJRDNIYW5kbGVyLkV2ZW50LlByaXZJRDNGcmFtZSwgdGhpcy5fb25Qcml2SUQzRnJhbWUuYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuX2lkM0hhbmRsZXIub24oSUQzSGFuZGxlci5FdmVudC5UZXh0SUQzRnJhbWUsIHRoaXMuX29uVGV4dElEM0ZyYW1lLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLl9pZDNIYW5kbGVyLm9uKElEM0hhbmRsZXIuRXZlbnQuU2xpY2VFbnRlcmVkLCB0aGlzLl9vblNsaWNlRW50ZXJlZC5iaW5kKHRoaXMpKTtcblxuICAgICAgICB0aGlzLl9vblZpZGVvVGltZVVwZGF0ZSA9IHRoaXMuX29uVmlkZW9UaW1lVXBkYXRlLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuX29uVmlkZW9TZWVraW5nID0gdGhpcy5fb25WaWRlb1NlZWtpbmcuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5fb25WaWRlb1NlZWtlZCA9IHRoaXMuX29uVmlkZW9TZWVrZWQuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5fb25NZWRpYVNvdXJjZU9wZW4gPSB0aGlzLl9vbk1lZGlhU291cmNlT3Blbi5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLl9vblZpZGVvUGxheWJhY2tFbmQgPSB0aGlzLl9vblZpZGVvUGxheWJhY2tFbmQuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5fb25UaW1lclRpY2sgPSB0aGlzLl9vblRpbWVyVGljay5iaW5kKHRoaXMpO1xuXG4gICAgICAgIHRoaXMuX2lzU2FmYXJpID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2lzSUUgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5faXNGaXJlZm94ID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2lzQ2hyb21lID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2ZpcmVkUmVhZHlFdmVudCA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9lbmRlZCA9IGZhbHNlO1xuICAgICAgICB0aGlzLl91c2luZ0N1c3RvbVVJID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2ludGVydmFsSWQgPSAwO1xuXG4gICAgICAgIHRoaXMuX292ZXJyaWRlQ3VycmVudFRpbWUoKTtcbiAgICAgICAgdGhpcy5fb3ZlcnJpZGVFbmRlZCgpO1xuICAgIH1cblxuICAgIHByaXZhdGUgX292ZXJyaWRlQ3VycmVudFRpbWUoKTogdm9pZCB7XG4gICAgICAgIC8vb3ZlcnJpZGUgJ2N1cnJlbnRUaW1lJyBwcm9wZXJ0eSBzbyB3ZSBjYW4gcHJldmVudCB1c2VycyBmcm9tIHNldHRpbmcgdmlkZW8uY3VycmVudFRpbWUsIGFsbG93aW5nIHRoZW1cbiAgICAgICAgLy8gdG8gc2tpcCBhZHMuXG4gICAgICAgIHZhciBnZXRDdXJyZW50VGltZSA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IoSFRNTE1lZGlhRWxlbWVudC5wcm90b3R5cGUsICdjdXJyZW50VGltZScpLmdldDtcbiAgICAgICAgdmFyIHNldEN1cnJlbnRUaW1lID0gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcihIVE1MTWVkaWFFbGVtZW50LnByb3RvdHlwZSwgJ2N1cnJlbnRUaW1lJykuc2V0O1xuXG4gICAgICAgIGxldCBzZWxmID0gdGhpcztcblxuICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkodGhpcy5fdmlkZW8sICdjdXJyZW50VGltZScsIHtcbiAgICAgICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBnZXRDdXJyZW50VGltZS5hcHBseSh0aGlzKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBzZXQ6IGZ1bmN0aW9uICh2YWw6IG51bWJlcikge1xuICAgICAgICAgICAgICAgIGlmIChzZWxmLmNhblNlZWsoKSkge1xuICAgICAgICAgICAgICAgICAgICBzZWxmLl9lbmRlZCA9IGZhbHNlO1xuXG4gICAgICAgICAgICAgICAgICAgIGxldCBhY3R1YWxUaW1lID0gc2VsZi5nZXRTZWVrVGltZSh2YWwpO1xuICAgICAgICAgICAgICAgICAgICBzZXRDdXJyZW50VGltZS5hcHBseSh0aGlzLCBbYWN0dWFsVGltZV0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBlbnVtZXJhYmxlOiBmYWxzZSxcbiAgICAgICAgICAgIGNvbmZpZ3VyYWJsZTogZmFsc2UsXG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgX292ZXJyaWRlRW5kZWQoKTogdm9pZCB7XG4gICAgICAgIC8vb3ZlcnJpZGUgZW5kZWQgcHJvcGVydHkgc28gd2UgY2FuIG1ha2UgaXQgbm90IHJlYWQtb25seS4gYWxsb3dpbmcgdXMgdG8gZmlyZSB0aGUgJ2VuZGVkJ1xuICAgICAgICAvLyBldmVudCBhbmQgaGF2ZSB0aGUgdWkgcmVzcG9uZCBjb3JyZWN0bHlcbiAgICAgICAgbGV0IHNlbGYgPSB0aGlzO1xuXG4gICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0aGlzLl92aWRlbywgJ2VuZGVkJywge1xuICAgICAgICAgICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNlbGYuX2VuZGVkO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGVudW1lcmFibGU6IGZhbHNlLFxuICAgICAgICAgICAgY29uZmlndXJhYmxlOiBmYWxzZSxcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgc3RhdGljIGdldCBFdmVudCgpIHtcbiAgICAgICAgcmV0dXJuIEV2ZW50cztcbiAgICB9XG5cbiAgICBkZXN0cm95KCk6IHZvaWQge1xuICAgICAgICB0aGlzLl9zdG9wTWFpbkxvb3AoKTtcblxuICAgICAgICBpZiAodHlwZW9mIHRoaXMuX2FkYXB0aXZlU291cmNlICE9ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5kZWxldGUoKTtcbiAgICAgICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlID0gdW5kZWZpbmVkO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuX29iamVjdFVybCkge1xuICAgICAgICAgICAgd2luZG93LlVSTC5yZXZva2VPYmplY3RVUkwodGhpcy5fb2JqZWN0VXJsKTtcbiAgICAgICAgICAgIHRoaXMuX29iamVjdFVybCA9IG51bGw7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBsb2FkKHVybDogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIHRoaXMuX2ZpcmVkUmVhZHlFdmVudCA9IGZhbHNlO1xuICAgICAgICB0aGlzLl91cmwgPSB1cmw7XG4gICAgICAgIHRoaXMuX3RhcmdldFRpbWUgPSB1bmRlZmluZWQ7XG4gICAgICAgIHRoaXMuX2ZvcmNlZEFkQnJlYWsgPSB1bmRlZmluZWQ7XG4gICAgICAgIHRoaXMuX2VuZGVkID0gZmFsc2U7XG5cbiAgICAgICAgdGhpcy5fbWVkaWFTb3VyY2UgPSBuZXcgTWVkaWFTb3VyY2UoKTtcbiAgICAgICAgaWYgKHR5cGVvZiB0aGlzLl9hZGFwdGl2ZVNvdXJjZSAhPSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2UuZGVsZXRlKCk7XG4gICAgICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZSA9IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX3ZpZGVvLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3RpbWV1cGRhdGUnLCB0aGlzLl9vblZpZGVvVGltZVVwZGF0ZSk7XG4gICAgICAgIHRoaXMuX3ZpZGVvLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3NlZWtpbmcnLCB0aGlzLl9vblZpZGVvU2Vla2luZyk7XG4gICAgICAgIHRoaXMuX3ZpZGVvLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3NlZWtlZCcsIHRoaXMuX29uVmlkZW9TZWVrZWQpO1xuICAgICAgICB0aGlzLl92aWRlby5yZW1vdmVFdmVudExpc3RlbmVyKCdlbmRlZCcsIHRoaXMuX29uVmlkZW9QbGF5YmFja0VuZCk7XG5cbiAgICAgICAgdGhpcy5fdmlkZW8uYWRkRXZlbnRMaXN0ZW5lcigndGltZXVwZGF0ZScsIHRoaXMuX29uVmlkZW9UaW1lVXBkYXRlKTtcbiAgICAgICAgdGhpcy5fdmlkZW8uYWRkRXZlbnRMaXN0ZW5lcignc2Vla2luZycsIHRoaXMuX29uVmlkZW9TZWVraW5nKTtcbiAgICAgICAgdGhpcy5fdmlkZW8uYWRkRXZlbnRMaXN0ZW5lcignc2Vla2VkJywgdGhpcy5fb25WaWRlb1NlZWtlZCk7XG4gICAgICAgIHRoaXMuX3ZpZGVvLmFkZEV2ZW50TGlzdGVuZXIoJ2VuZGVkJywgdGhpcy5fb25WaWRlb1BsYXliYWNrRW5kKTtcbiAgICAgICAgLy8gdmlkZW8ub25sb2FkZWRtZXRhZGF0YSBpcyB0aGUgZmlyc3QgdGltZSB0aGUgdmlkZW8gd2lkdGgvaGVpZ2h0IGlzIGF2YWlsYWJsZVxuICAgICAgICB0aGlzLl92aWRlby5vbmxvYWRlZG1ldGFkYXRhID0gdGhpcy51cGRhdGVWaWRlb1JlY3QuYmluZCh0aGlzKTtcblxuICAgICAgICB0aGlzLl9tZWRpYVNvdXJjZS5hZGRFdmVudExpc3RlbmVyKCdzb3VyY2VvcGVuJywgdGhpcy5fb25NZWRpYVNvdXJjZU9wZW4pO1xuXG4gICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlID0gbmV3IE1vZHVsZS5BZGFwdGl2ZVNvdXJjZSgpO1xuICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5vbkJlYW1Mb2FkZWQodGhpcy5fb25CZWFtTG9hZGVkLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5vblRyYWNrTG9hZGVkKHRoaXMuX29uVHJhY2tMb2FkZWQuYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlLm9uTG9hZGVkKHRoaXMuX29uU291cmNlTG9hZGVkLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5vbkxvYWRFcnJvcih0aGlzLl9vbkxvYWRFcnJvci5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2Uub25Ecm1FcnJvcih0aGlzLl9vbkRybUVycm9yLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5vblNlZ21lbnRNYXBDaGFuZ2VkKHRoaXMuX29uU2VnbWVudE1hcENoYW5nZWQuYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlLnN0YXJ0TWFpbkxvb3AodGhpcy5fc3RhcnRNYWluTG9vcC5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2Uuc3RvcE1haW5Mb29wKHRoaXMuX3N0b3BNYWluTG9vcC5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2Uuc3RhcnRMaWNlbnNlUmVxdWVzdCh0aGlzLl9zdGFydExpY2Vuc2VSZXF1ZXN0LmJpbmQodGhpcykpO1xuXG4gICAgICAgIGlmIChpc0xvY2FsU3RvcmFnZUF2YWlsYWJsZSgpKSB7XG4gICAgICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5zZXRMb2FkQW5kU2F2ZUJhbmR3aWR0aCh0aGlzLl9sb2FkQmFuZHdpZHRoSGlzdG9yeS5iaW5kKHRoaXMpLCB0aGlzLl9zYXZlQmFuZHdpZHRoSGlzdG9yeS5iaW5kKHRoaXMpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLl9vYmplY3RVcmwpIHtcbiAgICAgICAgICAgIHdpbmRvdy5VUkwucmV2b2tlT2JqZWN0VVJMKHRoaXMuX29iamVjdFVybCk7XG4gICAgICAgICAgICB0aGlzLl9vYmplY3RVcmwgPSBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fb2JqZWN0VXJsID0gd2luZG93LlVSTC5jcmVhdGVPYmplY3RVUkwodGhpcy5fbWVkaWFTb3VyY2UpO1xuICAgICAgICB0aGlzLl92aWRlby5zcmMgPSB0aGlzLl9vYmplY3RVcmw7XG4gICAgICAgIHRoaXMuX3ZpZGVvLmxvYWQoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEZXRlcm1pbmVzIGlmIHRoZSBwbGF5ZXIgY2FuIHNlZWsgZ2l2ZW4gaXQncyBjdXJyZW50IHBvc2l0aW9uIGFuZFxuICAgICAqIHdoZXRoZXIgb3Igbm90IGl0J3MgaW4gYW4gYWQgYnJlYWsuXG4gICAgICogQHJldHVybiB7Ym9vbGVhbn0gVHJ1ZSBpZiB0aGUgcGxheWVyIGNhbiBzZWVrLCBvdGhlcndpc2UgZmFsc2UuXG4gICAgICovXG4gICAgY2FuU2VlaygpOiBib29sZWFuIHtcbiAgICAgICAgaWYgKHRoaXMuX2FkYXB0aXZlU291cmNlID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLnBsYXlsaXN0VHlwZSA9PT0gJ0xJVkUnIHx8IHRoaXMucGxheWxpc3RUeXBlID09PSAnRVZFTlQnKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vY2FuJ3QgcHJldmVudCBhbGwgc2Vla3MgKHZpYSB1aSBvciBjdXJyZW50VGltZSBwcm9wZXJ0eSlcbiAgICAgICAgLy8gd2l0aG91dCB1c2luZyBhIGN1c3RvbSB1aSAoVVAtMzI2OSkuXG4gICAgICAgIGlmICghdGhpcy5fdXNpbmdDdXN0b21VSSkge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXRoaXMuX2NvbmZpZy5kaXNhYmxlU2Vla0R1cmluZ0FkQnJlYWspIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuX3NlZ21lbnRNYXAgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuICF0aGlzLl9zZWdtZW50TWFwLmluQWRCcmVhayh0aGlzLl92aWRlby5jdXJyZW50VGltZSk7XG4gICAgfVxuXG4gICAgZ2V0U2Vla1RpbWUodGFyZ2V0VGltZTogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKHRoaXMucGxheWxpc3RUeXBlID09PSAnTElWRScgfHwgdGhpcy5wbGF5bGlzdFR5cGUgPT09ICdFVkVOVCcpIHtcbiAgICAgICAgICAgIHJldHVybiB0YXJnZXRUaW1lO1xuICAgICAgICB9XG5cbiAgICAgICAgLy9hbGxvdyB1c2VycyB0byBzZWVrIGF0IGFueSB0aW1lXG4gICAgICAgIGlmICghdGhpcy5fY29uZmlnLmRpc2FibGVTZWVrRHVyaW5nQWRCcmVhaykge1xuICAgICAgICAgICAgcmV0dXJuIHRhcmdldFRpbWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXRoaXMuX3VzaW5nQ3VzdG9tVUkpIHtcbiAgICAgICAgICAgIHJldHVybiB0YXJnZXRUaW1lO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IGN1cnJlbnRUaW1lID0gdGhpcy5fdmlkZW8uY3VycmVudFRpbWU7XG5cbiAgICAgICAgLy9hcmUgd2Ugc2Vla2luZyB0byB0aGUgbWlkZGxlIG9mIGFuIGFkP1xuICAgICAgICAvL2lmIHNvLCBzZWVrIHRvIGJlZ2lubmluZyBvZiB0aGUgYWQgYW5kIHBsYXkgb24uXG4gICAgICAgIGxldCBhZEJyZWFrID0gdGhpcy5fc2VnbWVudE1hcC5nZXRBZEJyZWFrKHRhcmdldFRpbWUpO1xuICAgICAgICBpZiAoYWRCcmVhaykge1xuICAgICAgICAgICAgcmV0dXJuIGFkQnJlYWsuc3RhcnRUaW1lO1xuICAgICAgICB9XG5cbiAgICAgICAgLy9hcmUgd2Ugc2tpcHBpbmcgcGFzdCBhbnkgYWRzIGJ5IHNlZWtpbmc/XG4gICAgICAgIGxldCBhZEJyZWFrcyA9IHRoaXMuX3NlZ21lbnRNYXAuZ2V0QWRCcmVha3NCZXR3ZWVuKGN1cnJlbnRUaW1lLCB0YXJnZXRUaW1lKTtcbiAgICAgICAgaWYgKGFkQnJlYWtzICYmIGFkQnJlYWtzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIC8vcGxheSBuZWFyZXN0IGFkIGJyZWFrIHRoZW4gc2tpcCB0byBvcmlnaW5hbCB0YXJnZXQgdGltZVxuICAgICAgICAgICAgdGhpcy5fdGFyZ2V0VGltZSA9IHRhcmdldFRpbWU7XG4gICAgICAgICAgICB0aGlzLl9mb3JjZWRBZEJyZWFrID0gYWRCcmVha3NbYWRCcmVha3MubGVuZ3RoIC0gMV07XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fZm9yY2VkQWRCcmVhay5zdGFydFRpbWU7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGFyZ2V0VGltZTtcbiAgICB9XG5cbiAgICBwdWJsaWMgc2V0QnJvd3NlcihzYWZhcmk6IGJvb2xlYW4sIGllOiBib29sZWFuLCBjaHJvbWU6IGJvb2xlYW4sIGZpcmVmb3g6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5faXNTYWZhcmkgPSBzYWZhcmk7XG4gICAgICAgIHRoaXMuX2lzSUUgPSBpZTtcbiAgICAgICAgdGhpcy5faXNGaXJlZm94ID0gZmlyZWZveDtcbiAgICAgICAgdGhpcy5faXNDaHJvbWUgPSBjaHJvbWU7XG4gICAgICAgIHRoaXMuX3VzaW5nQ3VzdG9tVUkgPSB0cnVlO1xuICAgIH1cblxuICAgIHByaXZhdGUgX29uVmlkZW9UaW1lVXBkYXRlKCk6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy5fYWRhcHRpdmVTb3VyY2UgJiYgdGhpcy5fdmlkZW8pIHtcbiAgICAgICAgICAgIC8vaWYgd2UgZm9yY2VkIHRoZSB1c2VyIHRvIHdhdGNoIGFuIGFkIHdoZW4gdGhleSB0cmllZCB0byBzZWVrIHBhc3QgaXQsXG4gICAgICAgICAgICAvLyB0aGlzIHdpbGwgc2VlayB0byB0aGUgZGVzaXJlZCBwb3NpdGlvbiBhZnRlciB0aGUgYWQgaXMgb3ZlclxuICAgICAgICAgICAgaWYgKHRoaXMuX2ZvcmNlZEFkQnJlYWsgJiYgdGhpcy5fdmlkZW8uY3VycmVudFRpbWUgPiB0aGlzLl9mb3JjZWRBZEJyZWFrLmVuZFRpbWUpIHtcbiAgICAgICAgICAgICAgICBsZXQgdGFyZ2V0VGltZSA9IHRoaXMuX3RhcmdldFRpbWU7XG4gICAgICAgICAgICAgICAgdGhpcy5fdGFyZ2V0VGltZSA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICB0aGlzLl9mb3JjZWRBZEJyZWFrID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIHRoaXMuX3ZpZGVvLmN1cnJlbnRUaW1lID0gdGFyZ2V0VGltZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy9pZiB0aGUgdXNlciBjbGlja3Mgb24gdGhlIHRpbWVsaW5lIHdoZW4gdXNpbmcgdGhlIGJyb3dzZXIncyBuYXRpdmUgdWksXG4gICAgICAgICAgICAvLyBpdCBjYXVzZXMgYSAndGltZXVwZGF0ZScgZXZlbnQganVzdCBiZWZvcmUgYSAnc2VlaycgZXZlbnQsIGNhdXNpbmcgdGhlXG4gICAgICAgICAgICAvLyB1cGx5bmsgcGxheWVyIHRvIHNlbGVjdCByYXkgYnkgYmFuZHdpZHRoLiB0aGUgcmVzdWx0IG9mIHRoYXQgaXMgZG93bnNoaWZ0aW5nXG4gICAgICAgICAgICAvLyB0byB0aGUgbG93ZXN0IHJheSByaWdodCBiZWZvcmUgdGhlIHNlZWsuIHRoYXQgcmF5IHR5cGljYWxseSBpc24ndCBsb2FkZWQgeWV0XG4gICAgICAgICAgICAvLyBzbyBhbiBlcnJvciBvY2N1cnMgYW5kIHRoZSBzZWVrIGZhaWxzIGNhdXNpbmcgcGxheWJhY2sgdG8gc3RvcC5cbiAgICAgICAgICAgIGlmICh0aGlzLl9hZGFwdGl2ZVNvdXJjZSAmJiB0aGlzLl92aWRlbyAmJiAhdGhpcy5fdmlkZW8uc2Vla2luZykge1xuICAgICAgICAgICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlLm9uVGltZVVwZGF0ZSgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvL2FyZSB3ZSBhdCBvciBuZWFyIHRoZSBlbmQgb2YgYSBWT0QgYXNzZXQuIHZpZGVvLmN1cnJlbnRUaW1lIGRvZXNuJ3QgYWx3YXlzIGVxdWFsIHZpZGVvLmR1cmF0aW9uIHdoZW4gdGhlIGJyb3dzZXJcbiAgICAgICAgICAgIC8vIHN0b3BzIHBsYXliYWNrIGF0IHRoZSBlbmQgb2YgYSBWT0QuXG4gICAgICAgICAgICBpZiAodGhpcy5wbGF5bGlzdFR5cGUgPT09ICdWT0QnICYmICF0aGlzLl9lbmRlZCAmJiB0aGlzLl92aWRlby5kdXJhdGlvbiAtIHRoaXMuX3ZpZGVvLmN1cnJlbnRUaW1lIDw9IDAuMjUpIHtcblxuICAgICAgICAgICAgICAgIHRoaXMuX2VuZGVkID0gdHJ1ZTtcblxuICAgICAgICAgICAgICAgIC8vZmlyZSB2aWRlby5lbmRlZCBldmVudCBtYW51YWxseVxuICAgICAgICAgICAgICAgIHZhciBldmVudCA9IG5ldyBDdXN0b21FdmVudCgnZW5kZWQnKTtcbiAgICAgICAgICAgICAgICB0aGlzLl92aWRlby5kaXNwYXRjaEV2ZW50KGV2ZW50KTtcblxuICAgICAgICAgICAgICAgIHRoaXMuX3ZpZGVvLnBhdXNlKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHdlIGNhbiByZXNwb25kIHRvIHZpZGVvIHJlc2l6ZXMgcXVpY2tseSBieSBydW5uaW5nIHdpdGhpbiBfb25WaWRlb1RpbWVVcGRhdGUoKVxuICAgICAgICAgICAgdGhpcy51cGRhdGVWaWRlb1JlY3QoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgX29uVmlkZW9TZWVraW5nKCk6IHZvaWQge1xuICAgICAgICAvL1BhdXNpbmcgZHVyaW5nIHNlZWsgc2VlbXMgdG8gaGVscCBzYWZhcmkgb3V0IHdoZW4gc2Vla2luZyBiZXlvbmQgdGhlXG4gICAgICAgIC8vZW5kIG9mIGl0J3MgdmlkZW8gYnVmZmVyLCBwZXJoYXBzIEkgd2lsbCBmaW5kIGFub3RoZXIgc29sdXRpb24gYXQgc29tZVxuICAgICAgICAvL3BvaW50LCBidXQgZm9yIG5vdyB0aGlzIGlzIHdvcmtpbmcuXG4gICAgICAgIGlmICh0aGlzLl9pc1NhZmFyaSAmJiAhKHRoaXMucGxheWxpc3RUeXBlID09IFwiRVZFTlRcIiB8fCB0aGlzLnBsYXlsaXN0VHlwZSA9PSBcIkxJVkVcIikpIHtcbiAgICAgICAgICAgIHRoaXMuX2lzUGF1c2VkID0gdGhpcy5fdmlkZW8ucGF1c2VkO1xuICAgICAgICAgICAgdGhpcy5fdmlkZW8ucGF1c2UoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlLnNlZWsodGhpcy5fdmlkZW8uY3VycmVudFRpbWUpO1xuICAgIH1cblxuICAgIHByaXZhdGUgX29uVmlkZW9TZWVrZWQoKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLl9pc1NhZmFyaSAmJiAhdGhpcy5faXNQYXVzZWQgJiYgISh0aGlzLnBsYXlsaXN0VHlwZSA9PSBcIkVWRU5UXCIgfHwgdGhpcy5wbGF5bGlzdFR5cGUgPT0gXCJMSVZFXCIpKSB7XG4gICAgICAgICAgICB0aGlzLl92aWRlby5wbGF5KCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIF9vblZpZGVvUGxheWJhY2tFbmQoKTogdm9pZCB7XG4gICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlLnZpZGVvUGxheWJhY2tFbmQoKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vbk1lZGlhU291cmNlT3BlbigpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2UuaW5pdGlhbGl6ZVZpZGVvRWxlbWVudCh0aGlzLl92aWRlbywgdGhpcy5fbWVkaWFTb3VyY2UsIHRoaXMuX2NvbmZpZy5kZWJ1Zyk7XG4gICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlLmxvYWQodGhpcy5fdXJsKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vbklEM1RhZyhldmVudDogSUQzVGFnRXZlbnQpOiB2b2lkIHtcbiAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuSUQzVGFnLCBldmVudCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25UeHh4SUQzRnJhbWUoZXZlbnQ6IFR4eHhJRDNGcmFtZUV2ZW50KTogdm9pZCB7XG4gICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLlR4eHhJRDNGcmFtZSwgZXZlbnQpO1xuICAgIH1cblxuICAgIHByaXZhdGUgX29uUHJpdklEM0ZyYW1lKGV2ZW50OiBQcml2SUQzRnJhbWVFdmVudCk6IHZvaWQge1xuICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5Qcml2SUQzRnJhbWUsIGV2ZW50KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vblRleHRJRDNGcmFtZShldmVudDogVGV4dElEM0ZyYW1lRXZlbnQpOiB2b2lkIHtcbiAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuVGV4dElEM0ZyYW1lLCBldmVudCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25TbGljZUVudGVyZWQoZXZlbnQ6IFNsaWNlRXZlbnQpOiB2b2lkIHtcbiAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuU2xpY2VFbnRlcmVkLCBldmVudCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25CZWFtTG9hZGVkKCk6IHZvaWQge1xuICAgICAgICB0aGlzLl9hc3NldEluZm9TZXJ2aWNlID0gbmV3IEFzc2V0SW5mb1NlcnZpY2UodGhpcy5fYWRhcHRpdmVTb3VyY2UuZG9tYWluLCB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5zZXNzaW9uSWQpO1xuICAgICAgICB0aGlzLl9waW5nU2VydmljZSA9IG5ldyBQaW5nU2VydmljZSh0aGlzLl9hZGFwdGl2ZVNvdXJjZS5kb21haW4sIHRoaXMuX2FkYXB0aXZlU291cmNlLnNlc3Npb25JZCwgdGhpcy5fdmlkZW8pO1xuXG4gICAgICAgIHRoaXMuX3ZpZGVvLnRleHRUcmFja3MuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgKGNoYW5nZVRyYWNrRXZlbnQ6IFRyYWNrRXZlbnQpID0+IHtcbiAgICAgICAgICAgIHRoaXMub25UZXh0VHJhY2tDaGFuZ2VkKGNoYW5nZVRyYWNrRXZlbnQpO1xuICAgICAgICB9KTtcblxuICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5CZWFtTG9hZGVkKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vblRyYWNrTG9hZGVkKCk6IHZvaWQge1xuICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5UcmFja0xvYWRlZCk7XG5cbiAgICAgICAgaWYgKCF0aGlzLl9maXJlZFJlYWR5RXZlbnQpIHtcbiAgICAgICAgICAgIHRoaXMuX2ZpcmVkUmVhZHlFdmVudCA9IHRydWU7XG4gICAgICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5SZWFkeSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIF9zdGFydE1haW5Mb29wKCk6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy5faW50ZXJ2YWxJZCA9PT0gMCkge1xuICAgICAgICAgICAgdGhpcy5faW50ZXJ2YWxJZCA9IHNldEludGVydmFsKHRoaXMuX29uVGltZXJUaWNrLCAxNSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIF9zdG9wTWFpbkxvb3AoKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLl9pbnRlcnZhbElkICE9PSAwKSB7XG4gICAgICAgICAgICBjbGVhckludGVydmFsKHRoaXMuX2ludGVydmFsSWQpO1xuICAgICAgICAgICAgdGhpcy5faW50ZXJ2YWxJZCA9IDA7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIF9vblRpbWVyVGljaygpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5fYWRhcHRpdmVTb3VyY2Uub25UaWNrKCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfaXNVcGx5bmtVcmwodXJsOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICAgICAgY29uc3QgdGVtcCA9IHVybC50b0xvd2VyQ2FzZSgpO1xuICAgICAgICByZXR1cm4gdGVtcC5pbmRleE9mKCd1cGx5bmsuY29tJykgPiAtMSB8fCB0ZW1wLmluZGV4T2YoJ2Rvd25seW5rLmNvbScpID4gLTE7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25Tb3VyY2VMb2FkZWQoKTogdm9pZCB7XG4gICAgICAgIC8vcHJlLWxvYWQgc2VnbWVudCBtYXAgc28gYXNzZXRJbmZvIGRhdGEgd2lsbCBiZSBhdmFpbGFibGUgd2hlblxuICAgICAgICAvLyBuZXcgc2VnbWVudHMgYXJlIGVuY291bnRlcmVkLlxuICAgICAgICBpZiAoIXRoaXMuX2lzVXBseW5rVXJsKHRoaXMuX3VybCkpIHtcbiAgICAgICAgICAgIC8vQ2hlY2sgaWYgd2UgaGF2ZSBhbiB1cGx5bmsgYXNzZXQsIGlmIG5vdC4uLi4gVGhlbiBqdXN0IHN0YXJ0IHBsYXliYWNrXG4gICAgICAgICAgICB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5zdGFydCgpO1xuICAgICAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuU291cmNlTG9hZGVkKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuX2Fzc2V0SW5mb1NlcnZpY2UubG9hZFNlZ21lbnRNYXAodGhpcy5fc2VnbWVudE1hcCwgKCkgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlLnN0YXJ0KCk7XG4gICAgICAgICAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuU291cmNlTG9hZGVkKTtcblxuICAgICAgICAgICAgICAgIC8vc2V0IHRoZSBwb3N0ZXIgdXJsXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuX2NvbmZpZy5zaG93UG9zdGVyICYmIHRoaXMucGxheWxpc3RUeXBlID09IFwiVk9EXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgbGV0IGNvbnRlbnRTZWdtZW50ID0gdGhpcy5fc2VnbWVudE1hcC5jb250ZW50U2VnbWVudHNbMF07XG4gICAgICAgICAgICAgICAgICAgIGxldCBjb250ZW50QXNzZXQgPSB0aGlzLl9hc3NldEluZm9TZXJ2aWNlLmdldEFzc2V0SW5mbyhjb250ZW50U2VnbWVudC5pZCk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3ZpZGVvLnBvc3RlciA9IGNvbnRlbnRBc3NldC5wb3N0ZXJVcmw7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIF9vbkxvYWRFcnJvcihtZXNzYWdlOiBzdHJpbmcsIGNvZGU6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5Mb2FkRXJyb3IsIHsgZXJyb3I6IG1lc3NhZ2UsIGNvZGU6IGNvZGUgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25Ecm1FcnJvcihtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuRHJtRXJyb3IsIHsgZXJyb3I6IG1lc3NhZ2UgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25TZWdtZW50TWFwQ2hhbmdlZCgpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMucGxheWxpc3RUeXBlID09PSBcIlZPRFwiKSB7XG4gICAgICAgICAgICBpZiAoIXRoaXMuX3NlZ21lbnRNYXApIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9zZWdtZW50TWFwID0gbmV3IFNlZ21lbnRNYXAodGhpcy5fYWRhcHRpdmVTb3VyY2Uuc2VnbWVudE1hcCk7XG4gICAgICAgICAgICAgICAgdGhpcy5faW5pdFNlZ21lbnRUZXh0VHJhY2soKTtcbiAgICAgICAgICAgICAgICB0aGlzLl9pbml0QWRCcmVha1RleHRUcmFjaygpO1xuXG4gICAgICAgICAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuU2VnbWVudE1hcExvYWRlZCwgeyBzZWdtZW50TWFwOiB0aGlzLl9zZWdtZW50TWFwIH0pO1xuICAgICAgICAgICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLkxvYWRlZEFkQnJlYWtzLCB7IGFkQnJlYWtzOiB0aGlzLl9zZWdtZW50TWFwLmFkQnJlYWtzIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5fc2VnbWVudE1hcCA9IG5ldyBTZWdtZW50TWFwKHRoaXMuX2FkYXB0aXZlU291cmNlLnNlZ21lbnRNYXApO1xuICAgICAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuU2VnbWVudE1hcExvYWRlZCwgeyBzZWdtZW50TWFwOiB0aGlzLl9zZWdtZW50TWFwIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfc3RhcnRMaWNlbnNlUmVxdWVzdCgpOiB2b2lkIHtcbiAgICAgICAgLy9jb25zb2xlLmxvZyhcIlthZGFwdGl2ZS1wbGF5ZXIudHNdIFN0YXJ0IGxpY2Vuc2UgcmVxdWVzdCBQU1NIOiBcIiArIHRoaXMuX2FkYXB0aXZlU291cmNlLnBzc2gpO1xuXG4gICAgICAgIGlmICh0aGlzLl9saWNlbnNlTWFuYWdlciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aGlzLl9saWNlbnNlTWFuYWdlciA9IG5ldyBMaWNlbnNlTWFuYWdlcih0aGlzLl92aWRlbyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5fbGljZW5zZU1hbmFnZXIuc2V0S2V5U2VydmVyUHJlZml4KHRoaXMuX2FkYXB0aXZlU291cmNlLmtleVNlcnZlclByZWZpeCk7XG4gICAgICAgIHRoaXMuX2xpY2Vuc2VNYW5hZ2VyLmFkZExpY2Vuc2VSZXF1ZXN0KGJhc2U2NFRvQnVmZmVyKHRoaXMuX2FkYXB0aXZlU291cmNlLnBzc2gpKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9sb2FkQmFuZHdpZHRoSGlzdG9yeSgpOiBTbGljZURvd25sb2FkTWV0cmljW11bXSB7XG4gICAgICAgIGxldCBoaXN0b3J5VmVyc2lvbiA9IHBhcnNlSW50KGxvY2FsU3RvcmFnZS5nZXRJdGVtKFwiVXBseW5rSGlzdG9yeVZlcnNpb25cIiksIDEwKSB8fCAwO1xuICAgICAgICAvLyBDdXJyZW50IHZlcnNpb24gaXMgMi4gSWYgb2xkZXIgdGhhbiB0aGF0LCBkb24ndCBsb2FkIGl0XG4gICAgICAgIGlmIChoaXN0b3J5VmVyc2lvbiA8IDIgJiYgbG9jYWxTdG9yYWdlLmdldEl0ZW0oXCJVcGx5bmtIaXN0b3J5XCIpICE9IG51bGwpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiW2FkYXB0aXZlLXBsYXllci50c10gX2xvYWRCYW5kd2lkdGhIaXN0b3J5IGZvdW5kIGFuIG9sZGVyIGhpc3RvcnkgdmVyc2lvbi4gUmVtb3ZpbmcgaXRcIik7XG4gICAgICAgICAgICBsb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbShcIlVwbHlua0hpc3RvcnlcIik7XG4gICAgICAgICAgICBsb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbShcIlVwbHlua0hpc3RvcnlUaW1lc3RhbXBcIik7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuICAgICAgICBsZXQgdGltZXN0YW1wU3RyID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oXCJVcGx5bmtIaXN0b3J5VGltZXN0YW1wXCIpO1xuICAgICAgICBsZXQgdGltZXN0YW1wID0gcGFyc2VJbnQodGltZXN0YW1wU3RyLCAxMCkgfHwgMDtcbiAgICAgICAgbGV0IG5vdyA9IERhdGUubm93KCk7XG5cbiAgICAgICAgY29uc3QgTUFYX0FHRSA9IDYwICogNjAgKiAxMDAwOyAvLyAxIGhyLCBpbiBtaWxsaXNlY1xuICAgICAgICBpZiAobm93IC0gdGltZXN0YW1wIDwgTUFYX0FHRSkge1xuICAgICAgICAgICAgbGV0IGhpc3RvcnkgPSBsb2NhbFN0b3JhZ2UuZ2V0SXRlbShcIlVwbHlua0hpc3RvcnlcIik7XG4gICAgICAgICAgICByZXR1cm4gSlNPTi5wYXJzZShoaXN0b3J5KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9zYXZlQmFuZHdpZHRoSGlzdG9yeShoaXN0b3J5OiBTbGljZURvd25sb2FkTWV0cmljW11bXSk6IHZvaWQge1xuICAgICAgICBpZiAoaGlzdG9yeSA9PSBudWxsKSByZXR1cm47XG5cbiAgICAgICAgbGV0IHRpbWVzdGFtcCA9IERhdGUubm93KClcbiAgICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oXCJVcGx5bmtIaXN0b3J5VmVyc2lvblwiLCBcIjJcIik7XG4gICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKFwiVXBseW5rSGlzdG9yeVRpbWVzdGFtcFwiLCB0aW1lc3RhbXAudG9TdHJpbmcoKSk7XG4gICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKFwiVXBseW5rSGlzdG9yeVwiLCBKU09OLnN0cmluZ2lmeShoaXN0b3J5KSk7XG4gICAgfVxuXG4gICAgZ2V0VGh1bWJuYWlsKHRpbWU6IG51bWJlciwgc2l6ZTogXCJzbWFsbFwiIHwgXCJsYXJnZVwiID0gXCJzbWFsbFwiKTogdGh1bWIuVGh1bWJuYWlsIHtcbiAgICAgICAgcmV0dXJuIHRodW1iLmdldFRodW1ibmFpbCh0aW1lLCB0aGlzLl9zZWdtZW50TWFwLCB0aGlzLl9hc3NldEluZm9TZXJ2aWNlLCBzaXplKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9pbml0U2VnbWVudFRleHRUcmFjaygpOiB2b2lkIHtcbiAgICAgICAgaWYgKHR5cGVvZiBWVFRDdWUgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICAvL2JhaWwsIGNhbid0IGNyZWF0ZSBjdWVzXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgc2VnbWVudFRleHRUcmFjayA9IHRoaXMuX2dldE9yQ3JlYXRlVGV4dFRyYWNrKFwibWV0YWRhdGFcIiwgXCJzZWdtZW50c1wiKTtcblxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX3NlZ21lbnRNYXAubGVuZ3RoOyBpKyspIHtcblxuICAgICAgICAgICAgbGV0IHNlZ21lbnQgPSB0aGlzLl9zZWdtZW50TWFwLmdldFNlZ21lbnRBdChpKTtcbiAgICAgICAgICAgIGxldCBjdWUgPSBuZXcgVlRUQ3VlKHNlZ21lbnQuc3RhcnRUaW1lLCBzZWdtZW50LmVuZFRpbWUsIHNlZ21lbnQuaWQpO1xuXG4gICAgICAgICAgICBpZiAoY3VlICE9PSB1bmRlZmluZWQpIHtcblxuICAgICAgICAgICAgICAgIGN1ZS5hZGRFdmVudExpc3RlbmVyKFwiZW50ZXJcIiwgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9hc3NldEluZm9TZXJ2aWNlLmxvYWRTZWdtZW50KHNlZ21lbnQsIChhc3NldEluZm86IEFzc2V0SW5mbykgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuQXNzZXRFbnRlcmVkLCB7IHNlZ21lbnQ6IHNlZ21lbnQsIGFzc2V0OiBhc3NldEluZm8gfSk7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgY3VlLmFkZEV2ZW50TGlzdGVuZXIoXCJleGl0XCIsICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fYXNzZXRJbmZvU2VydmljZS5sb2FkU2VnbWVudChzZWdtZW50LCAoYXNzZXRJbmZvOiBBc3NldEluZm8pID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLkFzc2V0RXhpdGVkLCB7IHNlZ21lbnQ6IHNlZ21lbnQsIGFzc2V0OiBhc3NldEluZm8gfSk7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgc2VnbWVudFRleHRUcmFjay5hZGRDdWUoY3VlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgX2luaXRBZEJyZWFrVGV4dFRyYWNrKCk6IHZvaWQge1xuICAgICAgICBpZiAodHlwZW9mIFZUVEN1ZSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIC8vYmFpbCwgY2FuJ3QgY3JlYXRlIGN1ZXNcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBhZEJyZWFrcyA9IHRoaXMuX3NlZ21lbnRNYXAuYWRCcmVha3M7XG4gICAgICAgIGlmIChhZEJyZWFrcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCB0cmFjayA9IHRoaXMuX2dldE9yQ3JlYXRlVGV4dFRyYWNrKFwibWV0YWRhdGFcIiwgXCJhZGJyZWFrc1wiKTtcblxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGFkQnJlYWtzLmxlbmd0aDsgaSsrKSB7XG5cbiAgICAgICAgICAgIGxldCBhZEJyZWFrID0gYWRCcmVha3NbaV07XG4gICAgICAgICAgICBsZXQgY3VlID0gbmV3IFZUVEN1ZShhZEJyZWFrLnN0YXJ0VGltZSwgYWRCcmVhay5lbmRUaW1lLCBcImFkYnJlYWtcIik7XG5cbiAgICAgICAgICAgIGlmIChjdWUgIT09IHVuZGVmaW5lZCkge1xuXG4gICAgICAgICAgICAgICAgY3VlLmFkZEV2ZW50TGlzdGVuZXIoXCJlbnRlclwiLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLkFkQnJlYWtFbnRlcmVkLCB7IGFkQnJlYWs6IGFkQnJlYWsgfSk7XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICBjdWUuYWRkRXZlbnRMaXN0ZW5lcihcImV4aXRcIiwgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5BZEJyZWFrRXhpdGVkLCB7IGFkQnJlYWs6IGFkQnJlYWsgfSk7XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICB0cmFjay5hZGRDdWUoY3VlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLl9pc0ZpcmVmb3ggJiYgIXRoaXMuX3ZpZGVvLmF1dG9wbGF5ICYmIGFkQnJlYWtzWzBdLnN0YXJ0VGltZSA9PT0gMCAmJiB0aGlzLl92aWRlby5jdXJyZW50VGltZSA9PT0gMCkge1xuICAgICAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuQWRCcmVha0VudGVyZWQsIHsgYWRCcmVhazogYWRCcmVha3NbMF0gfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIF9nZXRPckNyZWF0ZVRleHRUcmFjayhraW5kOiBzdHJpbmcsIGxhYmVsOiBzdHJpbmcpOiBUZXh0VHJhY2sge1xuICAgICAgICAvL2xvb2sgZm9yIHByZXZpb3VzbHkgY3JlYXRlZCB0cmFja1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX3ZpZGVvLnRleHRUcmFja3MubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGxldCB0cmFjayA9IHRoaXMuX3ZpZGVvLnRleHRUcmFja3NbaV07XG4gICAgICAgICAgICBpZiAodHJhY2sua2luZCA9PT0ga2luZCAmJiB0cmFjay5sYWJlbCA9PT0gbGFiZWwpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJhY2s7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvL3JldHVybiBuZXcgdHJhY2tcbiAgICAgICAgcmV0dXJuIHRoaXMuX3ZpZGVvLmFkZFRleHRUcmFjayhraW5kLCBsYWJlbCk7XG4gICAgfVxuXG4gICAgcHVibGljIG9uVGV4dFRyYWNrQ2hhbmdlZChjaGFuZ2VUcmFja0V2ZW50OiBUcmFja0V2ZW50KTogdm9pZCB7XG4gICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlLm9uVGV4dFRyYWNrQ2hhbmdlZChjaGFuZ2VUcmFja0V2ZW50KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHVwZGF0ZVZpZGVvUmVjdCgpOiB2b2lkIHtcbiAgICAgICAgbGV0IGN1cnJlbnRWaWRlb1JlY3QgPSB0aGlzLl92aWRlby5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblxuICAgICAgICBpZiAoKCF0aGlzLl92aWRlb1JlY3QpIHx8ICh0aGlzLl92aWRlb1JlY3Qud2lkdGggIT0gY3VycmVudFZpZGVvUmVjdC53aWR0aCB8fCB0aGlzLl92aWRlb1JlY3QuaGVpZ2h0ICE9IGN1cnJlbnRWaWRlb1JlY3QuaGVpZ2h0KSkge1xuICAgICAgICAgICAgdGhpcy5fdmlkZW9SZWN0ID0gY3VycmVudFZpZGVvUmVjdDtcbiAgICAgICAgICAgIGlmICh0aGlzLl9hZGFwdGl2ZVNvdXJjZSAmJiB0aGlzLl9jb25maWcubGltaXRSZXNvbHV0aW9uVG9WaWV3U2l6ZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlLnNldE1heFZpZGVvUmVzb2x1dGlvbihjdXJyZW50VmlkZW9SZWN0LmhlaWdodCwgY3VycmVudFZpZGVvUmVjdC53aWR0aCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXQgYXVkaW9UcmFja3MoKTogVXBseW5rLkF1ZGlvVHJhY2tbXSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5hdWRpb1RyYWNrcztcbiAgICB9XG5cbiAgICBnZXQgYXVkaW9UcmFja0lkKCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5hdWRpb1RyYWNrSWQ7XG4gICAgfVxuXG4gICAgc2V0IGF1ZGlvVHJhY2tJZChpZDogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMuX2FkYXB0aXZlU291cmNlLmF1ZGlvVHJhY2tJZCA9IGlkO1xuICAgIH1cblxuICAgIGdldCBkb21haW4oKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlU291cmNlLmRvbWFpbjtcbiAgICB9XG5cbiAgICBnZXQgc2Vzc2lvbklkKCk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5zZXNzaW9uSWQ7XG4gICAgfVxuXG4gICAgZ2V0IG51bWJlck9mUmF5cygpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVTb3VyY2UubnVtYmVyT2ZSYXlzO1xuICAgIH1cblxuICAgIGdldCBhdmFpbGFibGVCYW5kd2lkdGhzKCk6IG51bWJlcltdIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlU291cmNlLmF2YWlsYWJsZUJhbmR3aWR0aHM7XG4gICAgfVxuXG4gICAgZ2V0IGF2YWlsYWJsZVJlc29sdXRpb25zKCk6IFJlc29sdXRpb25bXSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5hdmFpbGFibGVSZXNvbHV0aW9ucztcbiAgICB9XG5cbiAgICBnZXQgYXZhaWxhYmxlTWltZVR5cGVzKCk6IE1pbWVUeXBlW10ge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVTb3VyY2UuYXZhaWxhYmxlTWltZVR5cGVzO1xuICAgIH1cblxuICAgIGdldCBzZWdtZW50TWFwKCk6IFNlZ21lbnRNYXAge1xuICAgICAgICByZXR1cm4gdGhpcy5fc2VnbWVudE1hcDtcbiAgICB9XG5cbiAgICBnZXQgYWRCcmVha3MoKTogQWRCcmVha1tdIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3NlZ21lbnRNYXAuYWRCcmVha3M7XG4gICAgfVxuXG4gICAgZ2V0IGR1cmF0aW9uKCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZVNvdXJjZSA/IHRoaXMuX2FkYXB0aXZlU291cmNlLmR1cmF0aW9uIDogMDtcbiAgICB9XG5cbiAgICBnZXQgcGxheWxpc3RUeXBlKCk6IFwiVk9EXCIgfCBcIkVWRU5UXCIgfCBcIkxJVkVcIiB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZVNvdXJjZS5wbGF5bGlzdFR5cGU7XG4gICAgfVxuXG4gICAgZ2V0IHN1cHBvcnRzVGh1bWJuYWlscygpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuYXZhaWxhYmxlUmVzb2x1dGlvbnMubGVuZ3RoID4gMFxuICAgIH1cblxuICAgIGdldCBjbGFzc05hbWUoKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuICdBZGFwdGl2ZVBsYXllcic7XG4gICAgfVxuXG4gICAgZ2V0IHZlcnNpb24oKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuICcwMi4wMC4xNzA4MDgwMCc7IC8vd2lsbCBiZSBtb2RpZmllZCBieSB0aGUgYnVpbGQgc2NyaXB0XG4gICAgfVxufVxuIiwiZXhwb3J0IGNvbnN0IEV2ZW50cyA9IHtcbiAgICBCZWFtTG9hZGVkOiAgICAgICAnYmVhbWxvYWRlZCcsXG4gICAgVHJhY2tMb2FkZWQ6ICAgICAgJ3RyYWNrbG9hZGVkJyxcbiAgICBTb3VyY2VMb2FkZWQ6ICAgICAnc291cmNlbG9hZGVkJyxcbiAgICBMb2FkRXJyb3I6ICAgICAgICAnbG9hZGVycm9yJyxcbiAgICBEcm1FcnJvcjogICAgICAgICAnZHJtZXJyb3InLFxuICAgIFNlZ21lbnRNYXBMb2FkZWQ6ICdzZWdtZW50bWFwTG9hZGVkJyxcbiAgICBMb2FkZWRBZEJyZWFrczogICAnbG9hZGVkYWRicmVha3MnLFxuICAgIElEM1RhZzogICAgICAgICAgICdpZDNUYWcnLFxuICAgIFR4eHhJRDNGcmFtZTogICAgICd0eHh4SWQzRnJhbWUnLFxuICAgIFByaXZJRDNGcmFtZTogICAgICdwcml2SWQzRnJhbWUnLFxuICAgIFRleHRJRDNGcmFtZTogICAgICd0ZXh0SWQzRnJhbWUnLFxuICAgIFNsaWNlRW50ZXJlZDogICAgICdzbGljZUVudGVyZWQnLFxuICAgIEFzc2V0RW50ZXJlZDogICAgICdhc3NldGVudGVyZWQnLFxuICAgIEFzc2V0RXhpdGVkOiAgICAgICdhc3NldGV4aXRlZCcsXG4gICAgQWRCcmVha0VudGVyZWQ6ICAgJ2FkYnJlYWtlbnRlcmVkJyxcbiAgICBBZEJyZWFrRXhpdGVkOiAgICAnYWRicmVha2V4aXRlZCcsXG4gICAgUmVhZHk6ICAgICAgICAgICAgJ3JlYWR5J1xufTsiLCJpbXBvcnQgeyBzbGljZSB9IGZyb20gJy4uL3V0aWxzL3V0aWxzJztcblxuZXhwb3J0IGludGVyZmFjZSBUeHh4RGF0YSB7XG4gICAgdHlwZTogc3RyaW5nO1xuICAgIGtleTogc3RyaW5nO1xuICAgIHZhbHVlOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVGV4dEZyYW1lIHtcbiAgICB2YWx1ZTogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFR4eHhGcmFtZSB7XG4gICAgZGVzY3JpcHRpb246IHN0cmluZztcbiAgICB2YWx1ZTogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByaXZGcmFtZSB7XG4gICAgb3duZXI6IHN0cmluZztcbiAgICBkYXRhOiBVaW50OEFycmF5O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElEM0ZyYW1lIHtcbiAgICB0eXBlOiBzdHJpbmc7XG4gICAgc2l6ZTogbnVtYmVyO1xuICAgIGRhdGE6IFVpbnQ4QXJyYXk7XG59XG5cbmV4cG9ydCBjbGFzcyBJRDNEZWNvZGVyIHtcblxuICAgIHN0YXRpYyBnZXRGcmFtZShidWZmZXI6IFVpbnQ4QXJyYXkpOiBJRDNGcmFtZSB7XG4gICAgICAgIGlmIChidWZmZXIubGVuZ3RoIDwgMjEpIHtcbiAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIH1cblxuICAgICAgICAvKiBodHRwOi8vaWQzLm9yZy9pZDN2Mi4zLjBcbiAgICAgICAgKy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tK1xuICAgICAgICB8ICAgICAgSGVhZGVyICgxMCBieXRlcykgICAgICB8XG4gICAgICAgICstLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLStcbiAgICAgICAgWzBdICAgICA9ICdJJ1xuICAgICAgICBbMV0gICAgID0gJ0QnXG4gICAgICAgIFsyXSAgICAgPSAnMydcbiAgICAgICAgWzMsNF0gICA9IHtWZXJzaW9ufVxuICAgICAgICBbNV0gICAgID0ge0ZsYWdzfVxuICAgICAgICBbNi05XSAgID0ge0lEMyBTaXplfVxuICAgICAgICBbMTAtMTNdID0ge0ZyYW1lIElEfVxuICAgICAgICBbMTQtMTddID0ge0ZyYW1lIFNpemV9XG4gICAgICAgIFsxOCwxOV0gPSB7RnJhbWUgRmxhZ3N9IFxuICAgICAgICAqL1xuICAgICAgICBpZiAoYnVmZmVyWzBdID09PSA3MyAmJiAgLy8gSVxuICAgICAgICAgICAgYnVmZmVyWzFdID09PSA2OCAmJiAgLy8gRFxuICAgICAgICAgICAgYnVmZmVyWzJdID09PSA1MSkgeyAgLy8gM1xuXG4gICAgICAgICAgICBsZXQgZnJhbWVUeXBlID0gU3RyaW5nLmZyb21DaGFyQ29kZShidWZmZXJbMTBdLCBidWZmZXJbMTFdLCBidWZmZXJbMTJdLCBidWZmZXJbMTNdKTtcblxuICAgICAgICAgICAgbGV0IHNpemUgPSAwO1xuICAgICAgICAgICAgc2l6ZSA9IChidWZmZXJbMTRdIDw8IDI0KTtcbiAgICAgICAgICAgIHNpemUgfD0gKGJ1ZmZlclsxNV0gPDwgMTYpO1xuICAgICAgICAgICAgc2l6ZSB8PSAoYnVmZmVyWzE2XSA8PCA4KTtcbiAgICAgICAgICAgIHNpemUgfD0gYnVmZmVyWzE3XTtcblxuICAgICAgICAgICAgbGV0IGRhdGEgPSBzbGljZShidWZmZXIsIDIwKTtcbiAgICAgICAgICAgIHJldHVybiB7IHR5cGU6IGZyYW1lVHlwZSwgc2l6ZTogc2l6ZSwgZGF0YTogZGF0YSB9O1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICBzdGF0aWMgZGVjb2RlVGV4dEZyYW1lKGlkM0ZyYW1lOiBJRDNGcmFtZSk6IFRleHRGcmFtZSB7XG4gICAgICAgIC8qXG4gICAgICAgIEZvcm1hdDpcbiAgICAgICAgWzBdICAgPSB7VGV4dCBFbmNvZGluZ31cbiAgICAgICAgWzEtP10gPSB7VmFsdWV9XG4gICAgICAgICovXG5cbiAgICAgICAgaWYgKGlkM0ZyYW1lLnNpemUgPCAyKSB7XG4gICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGlkM0ZyYW1lLmRhdGFbMF0gIT09IDMpIHtcbiAgICAgICAgICAgIC8vb25seSBzdXBwb3J0IFVURi04XG4gICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBsZXQgZGF0YSA9IHNsaWNlKGlkM0ZyYW1lLmRhdGEsIDEpO1xuICAgICAgICByZXR1cm4geyB2YWx1ZTogSUQzRGVjb2Rlci51dGY4QXJyYXlUb1N0cihkYXRhKSB9O1xuICAgIH1cblxuICAgIHN0YXRpYyBkZWNvZGVUeHh4RnJhbWUoaWQzRnJhbWU6IElEM0ZyYW1lKTogVHh4eEZyYW1lIHtcbiAgICAgICAgLypcbiAgICAgICAgRm9ybWF0OlxuICAgICAgICBbMF0gICA9IHtUZXh0IEVuY29kaW5nfVxuICAgICAgICBbMS0/XSA9IHtEZXNjcmlwdGlvbn1cXDB7VmFsdWV9XG4gICAgICAgICovXG5cbiAgICAgICAgaWYgKGlkM0ZyYW1lLnNpemUgPCAyKSB7XG4gICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGlkM0ZyYW1lLmRhdGFbMF0gIT09IDMpIHtcbiAgICAgICAgICAgIC8vb25seSBzdXBwb3J0IFVURi04XG4gICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IGluZGV4ID0gMTtcbiAgICAgICAgbGV0IGRlc2NyaXB0aW9uID0gSUQzRGVjb2Rlci51dGY4QXJyYXlUb1N0cihzbGljZShpZDNGcmFtZS5kYXRhLCBpbmRleCkpO1xuXG4gICAgICAgIGluZGV4ICs9IGRlc2NyaXB0aW9uLmxlbmd0aCArIDE7XG4gICAgICAgIGxldCB2YWx1ZSA9IElEM0RlY29kZXIudXRmOEFycmF5VG9TdHIoc2xpY2UoaWQzRnJhbWUuZGF0YSwgaW5kZXgpKTtcblxuICAgICAgICByZXR1cm4geyBkZXNjcmlwdGlvbjogZGVzY3JpcHRpb24sIHZhbHVlOiB2YWx1ZSB9O1xuICAgIH1cblxuICAgIHN0YXRpYyBkZWNvZGVQcml2RnJhbWUoaWQzRnJhbWU6IElEM0ZyYW1lKTogUHJpdkZyYW1lIHtcbiAgICAgICAgLypcbiAgICAgICAgRm9ybWF0OiA8dGV4dCBzdHJpbmc+XFwwPGJpbmFyeSBkYXRhPlxuICAgICAgICAqL1xuXG4gICAgICAgIGlmIChpZDNGcmFtZS5zaXplIDwgMikge1xuICAgICAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vZmluZCBudWxsIHRlcm1pbmF0b3JcbiAgICAgICAgbGV0IG51bGxJbmRleCA9IDA7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgaWQzRnJhbWUuZGF0YS5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgaWYgKGlkM0ZyYW1lLmRhdGFbaV0gPT09IDApIHtcbiAgICAgICAgICAgICAgICBudWxsSW5kZXggPSBpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgbGV0IG93bmVyID0gU3RyaW5nLmZyb21DaGFyQ29kZS5hcHBseShudWxsLCBzbGljZShpZDNGcmFtZS5kYXRhLCAwLCBudWxsSW5kZXgpKTtcbiAgICAgICAgbGV0IHByaXZhdGVEYXRhID0gc2xpY2UoaWQzRnJhbWUuZGF0YSwgbnVsbEluZGV4ICsgMSk7XG5cbiAgICAgICAgcmV0dXJuIHsgb3duZXI6IG93bmVyLCBkYXRhOiBwcml2YXRlRGF0YSB9O1xuICAgIH1cblxuICAgIC8vIGh0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9xdWVzdGlvbnMvODkzNjk4NC91aW50OGFycmF5LXRvLXN0cmluZy1pbi1qYXZhc2NyaXB0LzIyMzczMTk3XG4gICAgLy8gaHR0cDovL3d3dy5vbmljb3MuY29tL3N0YWZmL2l6L2FtdXNlL2phdmFzY3JpcHQvZXhwZXJ0L3V0Zi50eHRcbiAgICAvKiB1dGYuanMgLSBVVEYtOCA8PT4gVVRGLTE2IGNvbnZlcnRpb25cbiAgICAgKlxuICAgICAqIENvcHlyaWdodCAoQykgMTk5OSBNYXNhbmFvIEl6dW1vIDxpekBvbmljb3MuY28uanA+XG4gICAgICogVmVyc2lvbjogMS4wXG4gICAgICogTGFzdE1vZGlmaWVkOiBEZWMgMjUgMTk5OVxuICAgICAqIFRoaXMgbGlicmFyeSBpcyBmcmVlLiAgWW91IGNhbiByZWRpc3RyaWJ1dGUgaXQgYW5kL29yIG1vZGlmeSBpdC5cbiAgICAgKi9cbiAgICBzdGF0aWMgdXRmOEFycmF5VG9TdHIoYXJyYXk6IFVpbnQ4QXJyYXkpOiBzdHJpbmcge1xuXG4gICAgICAgIGxldCBjaGFyMjogYW55O1xuICAgICAgICBsZXQgY2hhcjM6IGFueTtcbiAgICAgICAgbGV0IG91dCA9IFwiXCI7XG4gICAgICAgIGxldCBpID0gMDtcbiAgICAgICAgbGV0IGxlbmd0aCA9IGFycmF5Lmxlbmd0aDtcblxuICAgICAgICB3aGlsZSAoaSA8IGxlbmd0aCkge1xuICAgICAgICAgICAgbGV0IGMgPSBhcnJheVtpKytdO1xuICAgICAgICAgICAgc3dpdGNoIChjID4+IDQpIHtcbiAgICAgICAgICAgICAgICBjYXNlIDA6XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBvdXQ7XG4gICAgICAgICAgICAgICAgY2FzZSAxOiBjYXNlIDI6IGNhc2UgMzogY2FzZSA0OiBjYXNlIDU6IGNhc2UgNjogY2FzZSA3OlxuICAgICAgICAgICAgICAgICAgICAvLyAweHh4eHh4eFxuICAgICAgICAgICAgICAgICAgICBvdXQgKz0gU3RyaW5nLmZyb21DaGFyQ29kZShjKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAxMjogY2FzZSAxMzpcbiAgICAgICAgICAgICAgICAgICAgLy8gMTEweCB4eHh4ICAgMTB4eCB4eHh4XG4gICAgICAgICAgICAgICAgICAgIGNoYXIyID0gYXJyYXlbaSsrXTtcbiAgICAgICAgICAgICAgICAgICAgb3V0ICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoKChjICYgMHgxRikgPDwgNikgfCAoY2hhcjIgJiAweDNGKSk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgMTQ6XG4gICAgICAgICAgICAgICAgICAgIC8vIDExMTAgeHh4eCAgMTB4eCB4eHh4ICAxMHh4IHh4eHhcbiAgICAgICAgICAgICAgICAgICAgY2hhcjIgPSBhcnJheVtpKytdO1xuICAgICAgICAgICAgICAgICAgICBjaGFyMyA9IGFycmF5W2krK107XG4gICAgICAgICAgICAgICAgICAgIG91dCArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKCgoYyAmIDB4MEYpIDw8IDEyKSB8XG4gICAgICAgICAgICAgICAgICAgICAgICAoKGNoYXIyICYgMHgzRikgPDwgNikgfFxuICAgICAgICAgICAgICAgICAgICAgICAgKChjaGFyMyAmIDB4M0YpIDw8IDApKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gb3V0O1xuICAgIH1cbn0iLCJpbXBvcnQgeyBPYnNlcnZhYmxlIH0gZnJvbSAnLi4vdXRpbHMvb2JzZXJ2YWJsZSc7XG5pbXBvcnQgeyBUeHh4RGF0YSwgVHh4eEZyYW1lLCBUZXh0RnJhbWUsIFByaXZGcmFtZSwgSUQzRnJhbWUsIElEM0RlY29kZXIgfSBmcm9tICcuL2lkMy1kZWNvZGVyJztcbmltcG9ydCB7IGJhc2U2NFRvQnVmZmVyIH0gZnJvbSAnLi4vdXRpbHMvdXRpbHMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFR4eHhJRDNGcmFtZUV2ZW50IHtcbiAgICBjdWU6IFRleHRUcmFja0N1ZTtcbiAgICBmcmFtZTogVHh4eEZyYW1lO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByaXZJRDNGcmFtZUV2ZW50IHtcbiAgICBjdWU6IFRleHRUcmFja0N1ZTtcbiAgICBmcmFtZTogUHJpdkZyYW1lO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFRleHRJRDNGcmFtZUV2ZW50IHtcbiAgICBjdWU6IFRleHRUcmFja0N1ZTtcbiAgICBmcmFtZTogVGV4dEZyYW1lO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElEM1RhZ0V2ZW50IHtcbiAgICBjdWU6IFRleHRUcmFja0N1ZTtcbiAgICBmcmFtZTogSUQzRnJhbWU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2xpY2VFdmVudCB7XG4gICAgY3VlOiBUZXh0VHJhY2tDdWU7XG4gICAgYXNzZXRJZDogc3RyaW5nO1xuICAgIHJheUNoYXI6IHN0cmluZztcbiAgICBzbGljZUluZGV4OiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBXZWJLaXRUeHh4Q3VlIHtcbiAgICBrZXk6IHN0cmluZztcbiAgICBkYXRhOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBXZWJLaXRQcml2Q3VlIHtcbiAgICBrZXk6IHN0cmluZztcbiAgICBpbmZvOiBzdHJpbmc7XG4gICAgZGF0YTogQXJyYXlCdWZmZXI7XG59XG5cbmV4cG9ydCBjbGFzcyBJRDNIYW5kbGVyIGV4dGVuZHMgT2JzZXJ2YWJsZSB7XG4gICAgY29uc3RydWN0b3IodmlkZW86IEhUTUxWaWRlb0VsZW1lbnQpIHtcbiAgICAgICAgc3VwZXIoKTtcbiAgICAgICAgdmlkZW8udGV4dFRyYWNrcy5hZGRFdmVudExpc3RlbmVyKCdhZGR0cmFjaycsIHRoaXMuX29uQWRkVHJhY2suYmluZCh0aGlzKSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25BZGRUcmFjayhhZGRUcmFja0V2ZW50OiBhbnkpIHtcbiAgICAgICAgbGV0IHRyYWNrOiBUZXh0VHJhY2sgPSBhZGRUcmFja0V2ZW50LnRyYWNrO1xuICAgICAgICBpZiAodGhpcy5faXNJZDNNZXRhZGF0YVRyYWNrKHRyYWNrKSkge1xuICAgICAgICAgICAgdHJhY2subW9kZSA9ICdoaWRkZW4nO1xuICAgICAgICAgICAgdHJhY2suYWRkRXZlbnRMaXN0ZW5lcignY3VlY2hhbmdlJywgdGhpcy5fb25JRDNDdWVDaGFuZ2UuYmluZCh0aGlzKSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIF9pc0lkM01ldGFkYXRhVHJhY2sodHJhY2s6IFRleHRUcmFjayk6IGJvb2xlYW4ge1xuICAgICAgICBpZiAodHJhY2sua2luZCA9PSBcIm1ldGFkYXRhXCIgJiYgdHJhY2subGFiZWwgPT0gXCJJRDNcIikge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodHJhY2sua2luZCA9PSBcIm1ldGFkYXRhXCIgJiYgdHJhY2suaW5CYW5kTWV0YWRhdGFUcmFja0Rpc3BhdGNoVHlwZSkge1xuICAgICAgICAgICAgdmFyIGRpc3BhdGNoVHlwZSA9IHRyYWNrLmluQmFuZE1ldGFkYXRhVHJhY2tEaXNwYXRjaFR5cGU7XG4gICAgICAgICAgICByZXR1cm4gZGlzcGF0Y2hUeXBlID09PSBcImNvbS5hcHBsZS5zdHJlYW1pbmdcIiB8fCBkaXNwYXRjaFR5cGUgPT09IFwiMTUyNjBERkZGRjQ5NDQzMzIwRkY0OTQ0MzMyMDAwMEZcIjtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vbklEM0N1ZUNoYW5nZShjdWVDaGFuZ2VFdmVudDogYW55KSB7XG4gICAgICAgIGxldCB0cmFjayA9IGN1ZUNoYW5nZUV2ZW50LnRhcmdldDtcblxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRyYWNrLmFjdGl2ZUN1ZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGxldCBjdWUgPSB0cmFjay5hY3RpdmVDdWVzW2ldO1xuICAgICAgICAgICAgaWYgKCFjdWUub25lbnRlcikge1xuICAgICAgICAgICAgICAgIHRoaXMuX29uSUQzQ3VlKGN1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRyYWNrLmN1ZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGxldCBjdWUgPSB0cmFjay5jdWVzW2ldO1xuICAgICAgICAgICAgaWYgKCFjdWUub25lbnRlcikge1xuICAgICAgICAgICAgICAgIGN1ZS5vbmVudGVyID0gKGN1ZUV2ZW50OiBhbnkpID0+IHsgdGhpcy5fb25JRDNDdWUoY3VlRXZlbnQudGFyZ2V0KTsgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgX29uSUQzQ3VlKGN1ZTogVGV4dFRyYWNrQ3VlKSB7XG4gICAgICAgIGxldCBkYXRhOiBVaW50OEFycmF5ID0gdW5kZWZpbmVkO1xuICAgICAgICBsZXQgaWQzRnJhbWU6IElEM0ZyYW1lID0gdW5kZWZpbmVkO1xuICAgICAgICBsZXQgdHh4eEZyYW1lOiBUeHh4RnJhbWUgPSB1bmRlZmluZWQ7XG4gICAgICAgIGxldCB0ZXh0RnJhbWU6IFRleHRGcmFtZSA9IHVuZGVmaW5lZDtcbiAgICAgICAgbGV0IHByaXZGcmFtZTogUHJpdkZyYW1lID0gdW5kZWZpbmVkO1xuXG4gICAgICAgIGlmICgoPGFueT5jdWUpLmRhdGEpIHtcbiAgICAgICAgICAgIC8vbXMgZWRnZSAobmF0aXZlKSBwdXRzIGlkMyBkYXRhIGluIGN1ZS5kYXRhIHByb3BlcnR5XG4gICAgICAgICAgICBkYXRhID0gbmV3IFVpbnQ4QXJyYXkoKDxhbnk+Y3VlKS5kYXRhKTtcbiAgICAgICAgfSBlbHNlIGlmICgoPGFueT5jdWUpLnZhbHVlICYmICg8YW55PmN1ZSkudmFsdWUua2V5ICYmICg8YW55PmN1ZSkudmFsdWUuZGF0YSkge1xuXG4gICAgICAgICAgICAvL3NhZmFyaSAobmF0aXZlKSBwdXRzIGlkMyBkYXRhIGluIFdlYktpdERhdGFDdWUgb2JqZWN0cy5cbiAgICAgICAgICAgIC8vIG5vIGVuY29kZWQgZGF0YSBhdmFpbGFibGUuIHNhZmFyaSBkZWNvZGVzIGZyYW1lcyBuYXRpdmVseVxuICAgICAgICAgICAgLy8gaS5lLlxuICAgICAgICAgICAgLy8gdmFsdWU6IHtrZXk6IFwiVFhYWFwiLCBkYXRhOiBcIjZjMzUzN2VjMzMyNDQ2MTQ5ZjFkNTRkZGJlYmVhNDE0X2hfMDAwMDAxNDBcIn1cbiAgICAgICAgICAgIC8vIG9yXG4gICAgICAgICAgICAvLyB2YWx1ZToge2tleTogXCJQUklWXCIsIGluZm86IFwiY29tLmVzcG4uYXV0aG5ldC5oZWFydGJlYXRcIiwgZGF0YTogQXJyYXlCdWZmZXJ9XG5cbiAgICAgICAgICAgIGlmICgoPGFueT5jdWUpLnZhbHVlLmtleSA9PT0gJ1RYWFgnKSB7XG4gICAgICAgICAgICAgICAgbGV0IHR4eHhDdWU6IFdlYktpdFR4eHhDdWUgPSAoPGFueT5jdWUpLnZhbHVlO1xuICAgICAgICAgICAgICAgIHR4eHhGcmFtZSA9IHsgdmFsdWU6IHR4eHhDdWUuZGF0YSwgZGVzY3JpcHRpb246IHVuZGVmaW5lZCB9O1xuICAgICAgICAgICAgfSBlbHNlIGlmICgoPGFueT5jdWUpLnZhbHVlLmtleSA9PT0gJ1BSSVYnKSB7XG4gICAgICAgICAgICAgICAgbGV0IHByaXZDdWU6IFdlYktpdFByaXZDdWUgPSAoPGFueT5jdWUpLnZhbHVlO1xuICAgICAgICAgICAgICAgIHByaXZGcmFtZSA9IHsgb3duZXI6IHByaXZDdWUuaW5mbywgZGF0YTogbmV3IFVpbnQ4QXJyYXkocHJpdkN1ZS5kYXRhKSB9O1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy91cGx5bmsgY3JlYXRlZCBpZDMgY3Vlc1xuICAgICAgICAgICAgZGF0YSA9IGJhc2U2NFRvQnVmZmVyKGN1ZS50ZXh0KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChkYXRhKSB7XG4gICAgICAgICAgICBpZDNGcmFtZSA9IElEM0RlY29kZXIuZ2V0RnJhbWUoZGF0YSk7XG4gICAgICAgICAgICBpZiAoaWQzRnJhbWUpIHtcbiAgICAgICAgICAgICAgICBpZiAoaWQzRnJhbWUudHlwZSA9PT0gJ1RYWFgnKSB7XG4gICAgICAgICAgICAgICAgICAgIHR4eHhGcmFtZSA9IElEM0RlY29kZXIuZGVjb2RlVHh4eEZyYW1lKGlkM0ZyYW1lKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGlkM0ZyYW1lLnR5cGUgPT09ICdQUklWJykge1xuICAgICAgICAgICAgICAgICAgICBwcml2RnJhbWUgPSBJRDNEZWNvZGVyLmRlY29kZVByaXZGcmFtZShpZDNGcmFtZSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChpZDNGcmFtZS50eXBlWzBdID09PSAnVCcpIHtcbiAgICAgICAgICAgICAgICAgICAgdGV4dEZyYW1lID0gSUQzRGVjb2Rlci5kZWNvZGVUZXh0RnJhbWUoaWQzRnJhbWUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChpZDNGcmFtZSkge1xuICAgICAgICAgICAgbGV0IGV2ZW50OiBJRDNUYWdFdmVudCA9IHsgY3VlOiBjdWUsIGZyYW1lOiBpZDNGcmFtZSB9O1xuICAgICAgICAgICAgc3VwZXIuZmlyZShJRDNIYW5kbGVyLkV2ZW50LklEM1RhZywgZXZlbnQpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHR4eHhGcmFtZSkge1xuICAgICAgICAgICAgbGV0IHR4eHhFdmVudDogVHh4eElEM0ZyYW1lRXZlbnQgPSB7IGN1ZTogY3VlLCBmcmFtZTogdHh4eEZyYW1lIH07XG4gICAgICAgICAgICBzdXBlci5maXJlKElEM0hhbmRsZXIuRXZlbnQuVHh4eElEM0ZyYW1lLCB0eHh4RXZlbnQpO1xuXG4gICAgICAgICAgICBpZiAodHh4eEZyYW1lLnZhbHVlKSB7XG4gICAgICAgICAgICAgICAgbGV0IHNsaWNlRGF0YSA9IHR4eHhGcmFtZS52YWx1ZS5zcGxpdCgnXycpO1xuICAgICAgICAgICAgICAgIGlmIChzbGljZURhdGEubGVuZ3RoID09IDMpIHtcbiAgICAgICAgICAgICAgICAgICAgbGV0IHNsaWNlRXZlbnQ6IFNsaWNlRXZlbnQgPSB7IGN1ZTogY3VlLCBhc3NldElkOiBzbGljZURhdGFbMF0sIHJheUNoYXI6IHNsaWNlRGF0YVsxXSwgc2xpY2VJbmRleDogcGFyc2VJbnQoc2xpY2VEYXRhWzJdLCAxNikgfTtcbiAgICAgICAgICAgICAgICAgICAgc3VwZXIuZmlyZShJRDNIYW5kbGVyLkV2ZW50LlNsaWNlRW50ZXJlZCwgc2xpY2VFdmVudCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHByaXZGcmFtZSkge1xuICAgICAgICAgICAgbGV0IHByaXZFdmVudDogUHJpdklEM0ZyYW1lRXZlbnQgPSB7IGN1ZTogY3VlLCBmcmFtZTogcHJpdkZyYW1lIH07XG4gICAgICAgICAgICBzdXBlci5maXJlKElEM0hhbmRsZXIuRXZlbnQuUHJpdklEM0ZyYW1lLCBwcml2RXZlbnQpO1xuICAgICAgICB9IGVsc2UgaWYgKHRleHRGcmFtZSkge1xuICAgICAgICAgICAgbGV0IHRleHRFdmVudDogVGV4dElEM0ZyYW1lRXZlbnQgPSB7IGN1ZTogY3VlLCBmcmFtZTogdGV4dEZyYW1lIH07XG4gICAgICAgICAgICBzdXBlci5maXJlKElEM0hhbmRsZXIuRXZlbnQuVGV4dElEM0ZyYW1lLCB0ZXh0RXZlbnQpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgc3RhdGljIGdldCBFdmVudCgpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIElEM1RhZzogJ2lkM1RhZycsXG4gICAgICAgICAgICBUeHh4SUQzRnJhbWU6ICd0eHh4SWQzRnJhbWUnLFxuICAgICAgICAgICAgUHJpdklEM0ZyYW1lOiAncHJpdklkM0ZyYW1lJyxcbiAgICAgICAgICAgIFRleHRJRDNGcmFtZTogJ3RleHRJZDNGcmFtZScsXG4gICAgICAgICAgICBTbGljZUVudGVyZWQ6ICdzbGljZUVudGVyZWQnXG4gICAgICAgIH07XG4gICAgfVxufSIsIlxuZXhwb3J0IGNsYXNzIExpY2Vuc2VNYW5hZ2VyIHtcblxuICAgIHJlYWRvbmx5IExJQ0VOU0VfVFlQRV9OT05FID0gMDtcbiAgICByZWFkb25seSBMSUNFTlNFX1RZUEVfV0lERVZJTkUgPSAxO1xuICAgIHJlYWRvbmx5IExJQ0VOU0VfVFlQRV9QTEFZUkVBRFkgPSAyO1xuXG4gICAgcHJpdmF0ZSBfdmlkZW86IEhUTUxWaWRlb0VsZW1lbnQ7XG4gICAgcHJpdmF0ZSBfa2V5U2VydmVyUHJlZml4OiBzdHJpbmc7XG4gICAgcHJpdmF0ZSBfbGljZW5zZVR5cGUgPSAwO1xuICAgIHByaXZhdGUgX3Bzc2g6IFVpbnQ4QXJyYXk7XG4gICAgcHJpdmF0ZSBfbWVkaWFLZXlzOiBNZWRpYUtleXM7XG4gICAgcHJpdmF0ZSBfcGVuZGluZ0tleVJlcXVlc3RzOiB7IGluaXREYXRhVHlwZTogc3RyaW5nLCBpbml0RGF0YTogVWludDhBcnJheSB9W107XG5cblxuICAgIHB1YmxpYyBwbGF5UmVhZHlLZXlTeXN0ZW0gPSB7XG4gICAgICAgIGtleVN5c3RlbTogJ2NvbS5taWNyb3NvZnQucGxheXJlYWR5JyxcbiAgICAgICAgc3VwcG9ydGVkQ29uZmlnOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgaW5pdERhdGFUeXBlczogWydrZXlpZHMnLCAnY2VuYyddLFxuICAgICAgICAgICAgICAgIGF1ZGlvQ2FwYWJpbGl0aWVzOlxuICAgICAgICAgICAgICAgIFtcbiAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29udGVudFR5cGU6ICdhdWRpby9tcDQ7IGNvZGVjcz1cIm1wNGFcIicsXG4gICAgICAgICAgICAgICAgICAgICAgICByb2J1c3RuZXNzOiAnJ1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICB2aWRlb0NhcGFiaWxpdGllczpcbiAgICAgICAgICAgICAgICBbXG4gICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRlbnRUeXBlOiAndmlkZW8vbXA0OyBjb2RlY3M9XCJhdmMxXCInLFxuICAgICAgICAgICAgICAgICAgICAgICAgcm9idXN0bmVzczogJydcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgIH1cbiAgICAgICAgXVxuICAgIH07XG5cbiAgICBwdWJsaWMgd2lkZXZpbmVLZXlTeXN0ZW0gPSB7XG4gICAgICAgIGtleVN5c3RlbTogJ2NvbS53aWRldmluZS5hbHBoYScsXG4gICAgICAgIHN1cHBvcnRlZENvbmZpZzogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGxhYmVsOiAnZm9vJyxcbiAgICAgICAgICAgICAgICBpbml0RGF0YVR5cGVzOiBbJ2NlbmMnXSxcbiAgICAgICAgICAgICAgICBzZXNzaW9uVHlwZXM6IFsndGVtcG9yYXJ5J10sXG4gICAgICAgICAgICAgICAgYXVkaW9DYXBhYmlsaXRpZXM6XG4gICAgICAgICAgICAgICAgW1xuICAgICAgICAgICAgICAgICAgICB7IGNvbnRlbnRUeXBlOiAnYXVkaW8vbXA0OyBjb2RlY3M9XCJtcDRhLjQwLjVcIicsIHJvYnVzdG5lc3M6ICdTV19TRUNVUkVfQ1JZUFRPJyB9XG4gICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICB2aWRlb0NhcGFiaWxpdGllczpcbiAgICAgICAgICAgICAgICBbXG4gICAgICAgICAgICAgICAgICAgIC8vIHJvYnVzdG5lc3MgSFdfU0VDVVJFX0FMTCwgSFdfU0VDVVJFX0RFQ09ERSwgSFdfU0VDVVJFX0NSWVBUTywgU1dfU0VDVVJFX0RFQ09ERSwgU1dfU0VDVVJFX0NSWVBUT1xuICAgICAgICAgICAgICAgICAgICB7IGNvbnRlbnRUeXBlOiAndmlkZW8vbXA0OyBjb2RlY3M9XCJhdmMxLjRkMDAxZlwiJywgcm9idXN0bmVzczogJ0hXX1NFQ1VSRV9BTEwnIH0sXG4gICAgICAgICAgICAgICAgICAgIHsgY29udGVudFR5cGU6ICd2aWRlby9tcDQ7IGNvZGVjcz1cImF2YzEuNGQwMDFmXCInLCByb2J1c3RuZXNzOiAnSFdfU0VDVVJFX0RFQ09ERScgfSxcbiAgICAgICAgICAgICAgICAgICAgeyBjb250ZW50VHlwZTogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40ZDAwMWZcIicsIHJvYnVzdG5lc3M6ICdIV19TRUNVUkVfQ1JZUFRPJyB9LFxuICAgICAgICAgICAgICAgICAgICB7IGNvbnRlbnRUeXBlOiAndmlkZW8vbXA0OyBjb2RlY3M9XCJhdmMxLjRkMDAxZlwiJywgcm9idXN0bmVzczogJ1NXX1NFQ1VSRV9ERUNPREUnIH0sXG4gICAgICAgICAgICAgICAgICAgIHsgY29udGVudFR5cGU6ICd2aWRlby9tcDQ7IGNvZGVjcz1cImF2YzEuNGQwMDFmXCInLCByb2J1c3RuZXNzOiAnU1dfU0VDVVJFX0NSWVBUTycgfSxcblxuICAgICAgICAgICAgICAgICAgICB7IGNvbnRlbnRUeXBlOiAndmlkZW8vbXA0OyBjb2RlY3M9XCJhdmMxLjRkMDAxZVwiJywgcm9idXN0bmVzczogJ0hXX1NFQ1VSRV9BTEwnIH0sXG4gICAgICAgICAgICAgICAgICAgIHsgY29udGVudFR5cGU6ICd2aWRlby9tcDQ7IGNvZGVjcz1cImF2YzEuNGQwMDFlXCInLCByb2J1c3RuZXNzOiAnU1dfU0VDVVJFX0NSWVBUTycgfSxcbiAgICAgICAgICAgICAgICAgICAgeyBjb250ZW50VHlwZTogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40ZDAwMTZcIicsIHJvYnVzdG5lc3M6ICdIV19TRUNVUkVfQUxMJyB9LFxuICAgICAgICAgICAgICAgICAgICB7IGNvbnRlbnRUeXBlOiAndmlkZW8vbXA0OyBjb2RlY3M9XCJhdmMxLjRkMDAxNlwiJywgcm9idXN0bmVzczogJ1NXX1NFQ1VSRV9DUllQVE8nIH0sXG4gICAgICAgICAgICAgICAgICAgIHsgY29udGVudFR5cGU6ICd2aWRlby9tcDQ7IGNvZGVjcz1cImF2YzEuNDIwMDBkXCInLCByb2J1c3RuZXNzOiAnSFdfU0VDVVJFX0FMTCcgfSxcbiAgICAgICAgICAgICAgICAgICAgeyBjb250ZW50VHlwZTogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40MjAwMGRcIicsIHJvYnVzdG5lc3M6ICdTV19TRUNVUkVfQ1JZUFRPJyB9LFxuICAgICAgICAgICAgICAgICAgICB7IGNvbnRlbnRUeXBlOiAndmlkZW8vbXA0OyBjb2RlY3M9XCJhdmMxLjQyMDAwY1wiJywgcm9idXN0bmVzczogJ0hXX1NFQ1VSRV9BTEwnIH0sXG4gICAgICAgICAgICAgICAgICAgIHsgY29udGVudFR5cGU6ICd2aWRlby9tcDQ7IGNvZGVjcz1cImF2YzEuNDIwMDBjXCInLCByb2J1c3RuZXNzOiAnU1dfU0VDVVJFX0NSWVBUTycgfSxcbiAgICAgICAgICAgICAgICAgICAgeyBjb250ZW50VHlwZTogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40MjAwMGJcIicsIHJvYnVzdG5lc3M6ICdIV19TRUNVUkVfQUxMJyB9LFxuICAgICAgICAgICAgICAgICAgICB7IGNvbnRlbnRUeXBlOiAndmlkZW8vbXA0OyBjb2RlY3M9XCJhdmMxLjQyMDAwYlwiJywgcm9idXN0bmVzczogJ1NXX1NFQ1VSRV9DUllQVE8nIH0sXG4gICAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgfVxuICAgICAgICBdXG4gICAgfTtcblxuICAgIGNvbnN0cnVjdG9yKHZpZGVvIDogSFRNTFZpZGVvRWxlbWVudCkge1xuICAgICAgICAvLyBjb25zb2xlLmxvZyhcIkxpY2Vuc2VNYW5hZ2VyIENUT1JcIik7XG4gICAgICAgIHRoaXMuX3ZpZGVvID0gdmlkZW87XG4gICAgICAgIHRoaXMuX2tleVNlcnZlclByZWZpeCA9IG51bGw7XG4gICAgICAgIHRoaXMuX3Bzc2ggPSBudWxsO1xuICAgICAgICB0aGlzLl9tZWRpYUtleXMgPSBudWxsO1xuICAgICAgICB0aGlzLl9wZW5kaW5nS2V5UmVxdWVzdHMgPSBbXTtcbiAgICAgICAgdGhpcy5pbml0TWVkaWFLZXlzKCk7XG4gICAgfVxuXG4gICAgcHVibGljIGFkZExpY2Vuc2VSZXF1ZXN0KHBzc2hEYXRhOiBVaW50OEFycmF5KSB7XG4gICAgICAgIGNvbnNvbGUubG9nKFwiTGljZW5zZU1hbmFnZXIgLSBSZXF1ZXN0aW5nIGxpY2Vuc2UgZm9yIERSTSBwbGF5YmFja1wiKTtcbiAgICAgICAgdGhpcy5fcGVuZGluZ0tleVJlcXVlc3RzLnB1c2goeyBpbml0RGF0YVR5cGU6ICdjZW5jJywgaW5pdERhdGE6IHBzc2hEYXRhIH0pO1xuICAgICAgICB0aGlzLnByb2Nlc3NQZW5kaW5nS2V5cyh0aGlzKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgc2V0S2V5U2VydmVyUHJlZml4KGtleVNlcnZlclByZWZpeDogc3RyaW5nKSB7XG4gICAgICAgIC8vIGNvbnNvbGUubG9nKFwiS2V5U2VydmVyUHJlZml4OiBcIiArIGtleVNlcnZlclByZWZpeCk7XG4gICAgICAgIHRoaXMuX2tleVNlcnZlclByZWZpeCA9IGtleVNlcnZlclByZWZpeDtcbiAgICB9XG5cbiAgICBwcml2YXRlIGluaXRNZWRpYUtleXMoKSB7XG4gICAgICAgIGxldCBzZWxmID0gdGhpcztcbiAgICAgICAgdGhpcy5fbWVkaWFLZXlzID0gbnVsbDtcblxuICAgICAgICAvLyBUcnkgV2lkZXZpbmUuXG4gICAgICAgIG5hdmlnYXRvci5yZXF1ZXN0TWVkaWFLZXlTeXN0ZW1BY2Nlc3Moc2VsZi53aWRldmluZUtleVN5c3RlbS5rZXlTeXN0ZW0sIHNlbGYud2lkZXZpbmVLZXlTeXN0ZW0uc3VwcG9ydGVkQ29uZmlnKVxuICAgICAgICAgICAgLnRoZW4oZnVuY3Rpb24gKGtleVN5c3RlbUFjY2Vzcykge1xuICAgICAgICAgICAgICAgIHNlbGYuX2xpY2Vuc2VUeXBlID0gc2VsZi5MSUNFTlNFX1RZUEVfV0lERVZJTkU7XG5cbiAgICAgICAgICAgICAgICBrZXlTeXN0ZW1BY2Nlc3MuY3JlYXRlTWVkaWFLZXlzKClcbiAgICAgICAgICAgICAgICAgICAgLnRoZW4oZnVuY3Rpb24gKGNyZWF0ZWRNZWRpYUtleXMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYub25NZWRpYUtleUFjcXVpcmVkKHNlbGYsIGNyZWF0ZWRNZWRpYUtleXMpO1xuICAgICAgICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ0xpY2Vuc2VNYW5hZ2VyIC0gY3JlYXRlTWVkaWFLZXlzKCkgZmFpbGVkIGZvciBXaWRlVmluZScpXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSwgZnVuY3Rpb24gKCkgeyBjb25zb2xlLmxvZygnTGljZW5zZU1hbmFnZXIgLSBZb3VyIGJyb3dzZXIvc3lzdGVtIGRvZXMgbm90IHN1cHBvcnQgdGhlIHJlcXVlc3RlZCBjb25maWd1cmF0aW9ucyBmb3IgcGxheWluZyBXaWRlVmluZSBwcm90ZWN0ZWQgY29udGVudC4nKTsgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBvbk1lZGlhS2V5QWNxdWlyZWQoc2VsZjogTGljZW5zZU1hbmFnZXIsIGNyZWF0ZWRNZWRpYUtleXM6IE1lZGlhS2V5cykge1xuICAgICAgICBzZWxmLl9tZWRpYUtleXMgPSBjcmVhdGVkTWVkaWFLZXlzO1xuICAgICAgICBzZWxmLl92aWRlby5zZXRNZWRpYUtleXMoc2VsZi5fbWVkaWFLZXlzKTtcbiAgICAgICAgc2VsZi5wcm9jZXNzUGVuZGluZ0tleXMoc2VsZik7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBwcm9jZXNzUGVuZGluZ0tleXMoc2VsZjogTGljZW5zZU1hbmFnZXIpIHtcbiAgICAgICAgaWYgKHNlbGYuX21lZGlhS2V5cyA9PT0gbnVsbCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgd2hpbGUgKHNlbGYuX3BlbmRpbmdLZXlSZXF1ZXN0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBsZXQgZGF0YSA9IHNlbGYuX3BlbmRpbmdLZXlSZXF1ZXN0cy5zaGlmdCgpOyAvLyBwb3AgZmlyc3QgZWxlbWVudFxuICAgICAgICAgICAgc2VsZi5nZXROZXdLZXlTZXNzaW9uKGRhdGEuaW5pdERhdGFUeXBlLCBkYXRhLmluaXREYXRhKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgZ2V0TmV3S2V5U2Vzc2lvbiggaW5pdERhdGFUeXBlOiBzdHJpbmcsIGluaXREYXRhOiBVaW50OEFycmF5KSB7XG4gICAgICAgIGxldCBzZWxmID0gdGhpcztcbiAgICAgICAgbGV0IGtleVNlc3Npb24gPSBzZWxmLl9tZWRpYUtleXMuY3JlYXRlU2Vzc2lvbihcInRlbXBvcmFyeVwiKTtcbiAgICAgICAga2V5U2Vzc2lvbi5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgZnVuY3Rpb24gKGV2ZW50OiBNZWRpYUtleU1lc3NhZ2VFdmVudCkge1xuICAgICAgICAgICAgLy9jb25zb2xlLmxvZygnb25tZXNzYWdlICwgbWVzc2FnZSB0eXBlOiAnICsgZXZlbnQubWVzc2FnZVR5cGUpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBzZWxmLmRvd25sb2FkTmV3S2V5KHNlbGYuZ2V0TGljZW5zZVVybCgpLCBldmVudC5tZXNzYWdlLCBmdW5jdGlvbiAoZGF0YTogQXJyYXlCdWZmZXIpIHtcbiAgICAgICAgICAgICAgICAvL2NvbnNvbGUubG9nKCdldmVudC50YXJnZXQudXBkYXRlLCBkYXRhIGJ5dGVzOiAnICsgZGF0YS5ieXRlTGVuZ3RoKTtcbiAgICAgICAgICAgICAgICB2YXIgcHJvbSA9IDxQcm9taXNlPHZvaWQ+PiAoPE1lZGlhS2V5U2Vzc2lvbj5ldmVudC50YXJnZXQpLnVwZGF0ZShkYXRhKTtcbiAgICAgICAgICAgICAgICBwcm9tLmNhdGNoKGZ1bmN0aW9uIChlOiBzdHJpbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ0xpY2Vuc2VNYW5hZ2VyIC0gY2FsbCB0byBNZWRpYUtleVNlc3Npb24udXBkYXRlKCkgZmFpbGVkJyArIGUpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiTGljZW5zZU1hbmFnZXIgLSBmaW5pc2hlZCBsaWNlbnNlIHVwZGF0ZSBmb3IgRFJNIHBsYXliYWNrXCIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0sIGZhbHNlKTtcblxuICAgICAgICBsZXQgcmVxUHJvbWlzZSA9IDxQcm9taXNlPHZvaWQ+PiBrZXlTZXNzaW9uLmdlbmVyYXRlUmVxdWVzdChpbml0RGF0YVR5cGUsIGluaXREYXRhKTtcbiAgICAgICAgcmVxUHJvbWlzZS5jYXRjaChmdW5jdGlvbiAoZSA6IHN0cmluZykge1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ0xpY2Vuc2VNYW5hZ2VyIC0ga2V5U2Vzc2lvbi5nZW5lcmF0ZVJlcXVlc3QoKSBmYWlsZWQ6ICcgKyBlKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBnZXRMaWNlbnNlVXJsKCkge1xuICAgICAgICBpZiAodGhpcy5fbGljZW5zZVR5cGUgPT09IHRoaXMuTElDRU5TRV9UWVBFX1BMQVlSRUFEWSkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2tleVNlcnZlclByZWZpeCArIFwiL3ByXCI7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAodGhpcy5fbGljZW5zZVR5cGUgPT09IHRoaXMuTElDRU5TRV9UWVBFX1dJREVWSU5FKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fa2V5U2VydmVyUHJlZml4ICsgXCIvd3ZcIjtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gJyc7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBkb3dubG9hZE5ld0tleSh1cmwgOiBzdHJpbmcsIGtleU1lc3NhZ2U6IEFycmF5QnVmZmVyLCBjYWxsYmFjazogYW55KSB7IFxuICAgICAgICAvL2NvbnNvbGUubG9nKCdkb3dubG9hZE5ld0tleSAoeGhyKTogJyArIHVybCk7XG4gICAgICAgIGxldCBjaGFsbGVuZ2UgOiBBcnJheUJ1ZmZlcjtcbiAgICAgICAgbGV0IHhociA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xuICAgICAgICB4aHIub3BlbignUE9TVCcsIHVybCwgdHJ1ZSk7XG4gICAgICAgIHhoci53aXRoQ3JlZGVudGlhbHMgPSB0cnVlO1xuICAgICAgICB4aHIucmVzcG9uc2VUeXBlID0gJ2FycmF5YnVmZmVyJztcbiAgICAgICAgeGhyLm9ucmVhZHlzdGF0ZWNoYW5nZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGlmICh4aHIucmVhZHlTdGF0ZSA9PT0gNCkge1xuICAgICAgICAgICAgICAgIGlmICh4aHIuc3RhdHVzID09PSAyMDApIHtcbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2soeGhyLnJlc3BvbnNlKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyAnTGljZW5zZU1hbmFnZXIgLSBYSFIgZmFpbGVkICgnICsgdXJsICsgJykuIFN0YXR1czogJyArIHhoci5zdGF0dXMgKyAnICgnICsgeGhyLnN0YXR1c1RleHQgKyAnKSc7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICBpZiAodGhpcy5fbGljZW5zZVR5cGUgPT09IHRoaXMuTElDRU5TRV9UWVBFX1BMQVlSRUFEWSkge1xuICAgICAgICAgICAgLy8gLy8gRm9yIFBsYXlSZWFkeSBDRE1zLCB3ZSBuZWVkIHRvIGRpZyB0aGUgQ2hhbGxlbmdlIG91dCBvZiB0aGUgWE1MLlxuICAgICAgICAgICAgLy8gdmFyIGtleU1lc3NhZ2VYbWwgPSBuZXcgRE9NUGFyc2VyKCkucGFyc2VGcm9tU3RyaW5nKFN0cmluZy5mcm9tQ2hhckNvZGUuYXBwbHkobnVsbCwgbmV3IFVpbnQxNkFycmF5KGtleU1lc3NhZ2UpKSwgJ2FwcGxpY2F0aW9uL3htbCcpO1xuICAgICAgICAgICAgLy8gaWYgKGtleU1lc3NhZ2VYbWwuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ0NoYWxsZW5nZScpWzBdKSB7XG4gICAgICAgICAgICAvLyAgICAgY2hhbGxlbmdlID0gYXRvYihrZXlNZXNzYWdlWG1sLmdldEVsZW1lbnRzQnlUYWdOYW1lKCdDaGFsbGVuZ2UnKVswXS5jaGlsZE5vZGVzWzBdLm5vZGVWYWx1ZSk7XG4gICAgICAgICAgICAvLyB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gICAgIHRocm93ICdDYW5ub3QgZmluZCA8Q2hhbGxlbmdlPiBpbiBrZXkgbWVzc2FnZSc7XG4gICAgICAgICAgICAvLyB9XG4gICAgICAgICAgICAvLyB2YXIgaGVhZGVyTmFtZXMgPSBrZXlNZXNzYWdlWG1sLmdldEVsZW1lbnRzQnlUYWdOYW1lKCduYW1lJyk7XG4gICAgICAgICAgICAvLyB2YXIgaGVhZGVyVmFsdWVzID0ga2V5TWVzc2FnZVhtbC5nZXRFbGVtZW50c0J5VGFnTmFtZSgndmFsdWUnKTtcbiAgICAgICAgICAgIC8vIGlmIChoZWFkZXJOYW1lcy5sZW5ndGggIT09IGhlYWRlclZhbHVlcy5sZW5ndGgpIHtcbiAgICAgICAgICAgIC8vICAgICB0aHJvdyAnTWlzbWF0Y2hlZCBoZWFkZXIgPG5hbWU+Lzx2YWx1ZT4gcGFpciBpbiBrZXkgbWVzc2FnZSc7XG4gICAgICAgICAgICAvLyB9XG4gICAgICAgICAgICAvLyBmb3IgKHZhciBpID0gMDsgaSA8IGhlYWRlck5hbWVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAvLyAgICAgeGhyLnNldFJlcXVlc3RIZWFkZXIoaGVhZGVyTmFtZXNbaV0uY2hpbGROb2Rlc1swXS5ub2RlVmFsdWUsIGhlYWRlclZhbHVlc1tpXS5jaGlsZE5vZGVzWzBdLm5vZGVWYWx1ZSk7XG4gICAgICAgICAgICAvLyB9XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAodGhpcy5fbGljZW5zZVR5cGUgPT09IHRoaXMuTElDRU5TRV9UWVBFX1dJREVWSU5FKXtcbiAgICAgICAgICAgIC8vIEZvciBXaWRldmluZSBDRE1zLCB0aGUgY2hhbGxlbmdlIGlzIHRoZSBrZXlNZXNzYWdlLlxuICAgICAgICAgICAgY2hhbGxlbmdlID0ga2V5TWVzc2FnZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHhoci5zZW5kKGNoYWxsZW5nZSk7XG4gICAgfVxufVxuIiwiaW1wb3J0IHsgT2JzZXJ2YWJsZSB9IGZyb20gJy4vdXRpbHMvb2JzZXJ2YWJsZSc7XG5pbXBvcnQgeyBFdmVudHMgfSBmcm9tICcuL2V2ZW50cyc7XG5pbXBvcnQgeyBQbGF5ZXIsIFJlc29sdXRpb24sIE1pbWVUeXBlIH0gZnJvbSAnLi9wbGF5ZXInO1xuaW1wb3J0ICogYXMgdGh1bWIgZnJvbSAnLi91dGlscy90aHVtYm5haWwtaGVscGVyJztcbmltcG9ydCB7IFNlZ21lbnRNYXAgfSBmcm9tICcuL3V0aWxzL3NlZ21lbnQtbWFwJztcbmltcG9ydCB7IEFkQnJlYWsgfSBmcm9tICcuL2FkL2FkLWJyZWFrJztcbmltcG9ydCB7IElEM0hhbmRsZXIsIElEM1RhZ0V2ZW50LCBUeHh4SUQzRnJhbWVFdmVudCwgUHJpdklEM0ZyYW1lRXZlbnQsIFRleHRJRDNGcmFtZUV2ZW50LCBTbGljZUV2ZW50IH0gZnJvbSAnLi9pZDMvaWQzLWhhbmRsZXInO1xuaW1wb3J0IHsgSUQzRGF0YSB9IGZyb20gJy4vaWQzL2lkMy1kYXRhJztcbmltcG9ydCB7IEFzc2V0SW5mbywgQXNzZXRJbmZvU2VydmljZSB9IGZyb20gJy4vd2ViLXNlcnZpY2VzL2Fzc2V0LWluZm8tc2VydmljZSc7XG5pbXBvcnQgeyBQaW5nU2VydmljZSB9IGZyb20gJy4vd2ViLXNlcnZpY2VzL3Bpbmctc2VydmljZSc7XG5cbmV4cG9ydCBjbGFzcyBOYXRpdmVQbGF5ZXIgZXh0ZW5kcyBPYnNlcnZhYmxlIGltcGxlbWVudHMgUGxheWVyIHtcbiAgICBwcml2YXRlIF92aWRlbzogSFRNTFZpZGVvRWxlbWVudDtcbiAgICBwcml2YXRlIF91cmw6IHN0cmluZztcbiAgICBwcml2YXRlIF9wbGF5bGlzdFR5cGU6IFwiVk9EXCIgfCBcIkVWRU5UXCIgfCBcIkxJVkVcIjtcbiAgICBwcml2YXRlIF9pZDNIYW5kbGVyOiBJRDNIYW5kbGVyO1xuICAgIHByaXZhdGUgX2ZpcmVkUmVhZHlFdmVudDogYm9vbGVhbjtcbiAgICBwcml2YXRlIF9hc3NldEluZm9TZXJ2aWNlOiBBc3NldEluZm9TZXJ2aWNlO1xuICAgIHByaXZhdGUgX3BpbmdTZXJ2aWNlOiBQaW5nU2VydmljZTtcbiAgICBwcml2YXRlIF9zZXNzaW9uSWQ6IHN0cmluZztcbiAgICBwcml2YXRlIF9kb21haW46IHN0cmluZztcbiAgICBwcml2YXRlIF9jdXJyZW50QXNzZXRJZDogc3RyaW5nO1xuICAgIHByaXZhdGUgX2NvbmZpZzogUGxheWVyT3B0aW9ucztcbiAgICBwcml2YXRlIF9pbkFkQnJlYWs6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSBfY3VycmVudEFkQnJlYWs6IEFkQnJlYWs7XG5cbiAgICAvL2RvIG5vdGhpbmcgcHJvcGVydGllc1xuICAgIHJlYWRvbmx5IG51bWJlck9mUmF5czogbnVtYmVyO1xuICAgIHJlYWRvbmx5IGF2YWlsYWJsZUJhbmR3aWR0aHM6IG51bWJlcltdO1xuICAgIHJlYWRvbmx5IGF2YWlsYWJsZVJlc29sdXRpb25zOiBSZXNvbHV0aW9uW107XG4gICAgcmVhZG9ubHkgYXZhaWxhYmxlTWltZVR5cGVzOiBNaW1lVHlwZVtdO1xuICAgIHJlYWRvbmx5IHNlZ21lbnRNYXA6IFNlZ21lbnRNYXA7XG4gICAgcmVhZG9ubHkgYWRCcmVha3M6IEFkQnJlYWtbXTtcbiAgICByZWFkb25seSBpc0F1ZGlvT25seTogYm9vbGVhbjtcblxuICAgIHByaXZhdGUgcmVhZG9ubHkgX2RlZmF1bHRzOiBQbGF5ZXJPcHRpb25zID0ge1xuICAgICAgICBkaXNhYmxlU2Vla0R1cmluZ0FkQnJlYWs6IHRydWUsXG4gICAgICAgIHNob3dQb3N0ZXI6IGZhbHNlLFxuICAgICAgICBkZWJ1ZzogZmFsc2VcbiAgICB9O1xuXG4gICAgY29uc3RydWN0b3IodmlkZW86IEhUTUxWaWRlb0VsZW1lbnQsIG9wdGlvbnM/OiBQbGF5ZXJPcHRpb25zKSB7XG4gICAgICAgIHN1cGVyKCk7XG5cbiAgICAgICAgLy9pbml0IGNvbmZpZ1xuICAgICAgICB2YXIgZGF0YSA9IHt9O1xuXG4gICAgICAgIC8vdHJ5IHBhcnNpbmcgZGF0YSBhdHRyaWJ1dGUgY29uZmlnXG4gICAgICAgIHRyeSB7IGRhdGEgPSBKU09OLnBhcnNlKHZpZGVvLmdldEF0dHJpYnV0ZSgnZGF0YS1jb25maWcnKSk7IH1cbiAgICAgICAgY2F0Y2ggKGUpIHsgfVxuXG4gICAgICAgIC8vbWVyZ2UgZGVmYXVsdHMgd2l0aCB1c2VyIG9wdGlvbnNcbiAgICAgICAgdGhpcy5fY29uZmlnID0gT2JqZWN0LmFzc2lnbih7fSwgdGhpcy5fZGVmYXVsdHMsIG9wdGlvbnMsIGRhdGEpO1xuXG4gICAgICAgIHRoaXMuX3ZpZGVvID0gdmlkZW87XG4gICAgICAgIHRoaXMuX2lkM0hhbmRsZXIgPSBuZXcgSUQzSGFuZGxlcih2aWRlbyk7XG4gICAgICAgIHRoaXMuX2lkM0hhbmRsZXIub24oSUQzSGFuZGxlci5FdmVudC5JRDNUYWcsIHRoaXMuX29uSUQzVGFnLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLl9pZDNIYW5kbGVyLm9uKElEM0hhbmRsZXIuRXZlbnQuVHh4eElEM0ZyYW1lLCB0aGlzLl9vblR4eHhJRDNGcmFtZS5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5faWQzSGFuZGxlci5vbihJRDNIYW5kbGVyLkV2ZW50LlByaXZJRDNGcmFtZSwgdGhpcy5fb25Qcml2SUQzRnJhbWUuYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuX2lkM0hhbmRsZXIub24oSUQzSGFuZGxlci5FdmVudC5UZXh0SUQzRnJhbWUsIHRoaXMuX29uVGV4dElEM0ZyYW1lLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLl9pZDNIYW5kbGVyLm9uKElEM0hhbmRsZXIuRXZlbnQuU2xpY2VFbnRlcmVkLCB0aGlzLl9vblNsaWNlRW50ZXJlZC5iaW5kKHRoaXMpKTtcblxuICAgICAgICB0aGlzLl9vbkR1cmF0aW9uQ2hhbmdlID0gdGhpcy5fb25EdXJhdGlvbkNoYW5nZS5iaW5kKHRoaXMpO1xuXG4gICAgICAgIHRoaXMuX292ZXJyaWRlQ3VycmVudFRpbWUoKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgbG9hZCh1cmw6IHN0cmluZyk6IHZvaWQge1xuXG4gICAgICAgIHRoaXMuX2ZpcmVkUmVhZHlFdmVudCA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9jdXJyZW50QXNzZXRJZCA9IG51bGw7XG5cbiAgICAgICAgdGhpcy5fdmlkZW8ucmVtb3ZlRXZlbnRMaXN0ZW5lcignZHVyYXRpb25jaGFuZ2UnLCB0aGlzLl9vbkR1cmF0aW9uQ2hhbmdlKTtcbiAgICAgICAgdGhpcy5fdmlkZW8uYWRkRXZlbnRMaXN0ZW5lcignZHVyYXRpb25jaGFuZ2UnLCB0aGlzLl9vbkR1cmF0aW9uQ2hhbmdlKTtcblxuICAgICAgICAvL3Nlc3Npb25JZCAoP3Bicz0pIG1heSBvciBtYXkgbm90IGJlIHBhcnQgb2YgdGhlIHVybFxuICAgICAgICB0aGlzLl9zZXNzaW9uSWQgPSB0aGlzLl9nZXRTZXNzaW9uSWQodXJsKTtcbiAgICAgICAgdGhpcy5fZG9tYWluID0gdGhpcy5fZ2V0RG9tYWluKHVybCk7XG5cbiAgICAgICAgdGhpcy5fYXNzZXRJbmZvU2VydmljZSA9IG5ldyBBc3NldEluZm9TZXJ2aWNlKHRoaXMuZG9tYWluKTtcblxuICAgICAgICAvL2Nhbid0IHVzZSAnY29udGVudC51cGx5bmsuY29tJyBhcyBhIGRvbWFpbiBuYW1lIGJlY2F1c2Ugc2Vzc2lvbiBkYXRhIGxpdmVzXG4gICAgICAgIC8vIGluc2lkZSBhIHNwZWNpZmljIGRvbWFpblxuICAgICAgICBpZih0aGlzLl9kb21haW4gIT09ICdjb250ZW50LnVwbHluay5jb20nKSB7XG4gICAgICAgICAgICB0aGlzLl9waW5nU2VydmljZSA9IG5ldyBQaW5nU2VydmljZSh0aGlzLmRvbWFpbiwgdGhpcy5fc2Vzc2lvbklkLCB0aGlzLl92aWRlbyk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl91cmwgPSB1cmw7XG4gICAgICAgIHRoaXMuX3ZpZGVvLnNyYyA9IHVybDtcbiAgICAgICAgdGhpcy5fdmlkZW8ubG9hZCgpO1xuICAgIH1cblxuICAgIHB1YmxpYyBkZXN0cm95KCk6IHZvaWQge1xuICAgICAgICB0aGlzLl92aWRlby5zcmMgPSBudWxsO1xuICAgIH1cblxuICAgIHByaXZhdGUgX292ZXJyaWRlQ3VycmVudFRpbWUoKTogdm9pZCB7XG4gICAgICAgIC8vb3ZlcnJpZGUgJ2N1cnJlbnRUaW1lJyBwcm9wZXJ0eSBzbyB3ZSBjYW4gcHJldmVudCBcbiAgICAgICAgLy8gdXNlcnMgZnJvbSBzZXR0aW5nIHZpZGVvLmN1cnJlbnRUaW1lLCBhbGxvd2luZyB0aGVtXG4gICAgICAgIC8vIHRvIHNraXAgYWRzLlxuICAgICAgICBjb25zdCBjdXJyZW50VGltZURlc2NyaXB0b3IgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKEhUTUxNZWRpYUVsZW1lbnQucHJvdG90eXBlLCAnY3VycmVudFRpbWUnKTtcbiAgICAgICAgaWYgKGN1cnJlbnRUaW1lRGVzY3JpcHRvcikge1xuICAgICAgICAgICAgY29uc3QgZ2V0Q3VycmVudFRpbWUgPSBjdXJyZW50VGltZURlc2NyaXB0b3IuZ2V0O1xuICAgICAgICAgICAgY29uc3Qgc2V0Q3VycmVudFRpbWUgPSBjdXJyZW50VGltZURlc2NyaXB0b3Iuc2V0O1xuXG4gICAgICAgICAgICBsZXQgc2VsZiA9IHRoaXM7XG5cbiAgICAgICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0aGlzLl92aWRlbywgJ2N1cnJlbnRUaW1lJywge1xuICAgICAgICAgICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZ2V0Q3VycmVudFRpbWUuYXBwbHkodGhpcyk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBzZXQ6IGZ1bmN0aW9uICh2YWwpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYoc2VsZi5jYW5TZWVrKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNldEN1cnJlbnRUaW1lLmFwcGx5KHRoaXMsIFt2YWxdKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgZW51bWVyYWJsZTogZmFsc2UsXG4gICAgICAgICAgICAgICAgY29uZmlndXJhYmxlOiBmYWxzZSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRGV0ZXJtaW5lcyBpZiB0aGUgcGxheWVyIGNhbiBzZWVrIGdpdmVuIGl0J3MgY3VycmVudCBwb3NpdGlvbiBhbmRcbiAgICAgKiB3ZXRoZXIgb3Igbm90IGl0J3MgaW4gYW4gYWQgYnJlYWsuXG4gICAgICogQHJldHVybiB7Ym9vbGVhbn0gVHJ1ZSBpZiB0aGUgcGxheWVyIGNhbiBzZWVrLCBvdGhlcndpc2UgZmFsc2UuXG4gICAgICovXG4gICAgY2FuU2VlaygpOiBib29sZWFuIHtcbiAgICAgICAgaWYgKCF0aGlzLl9jb25maWcuZGlzYWJsZVNlZWtEdXJpbmdBZEJyZWFrKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiAhdGhpcy5faW5BZEJyZWFrO1xuICAgIH1cblxuICAgIHByaXZhdGUgX2dldFNlc3Npb25JZCh1cmw6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgICAgIC8vaHR0cDovL3N0YWNrb3ZlcmZsb3cuY29tL2EvNTE1ODMwMVxuICAgICAgICB2YXIgbWF0Y2ggPSBSZWdFeHAoJ1s/Jl1wYnM9KFteJl0qKScpLmV4ZWModXJsKTtcbiAgICAgICAgcmV0dXJuIG1hdGNoICYmIGRlY29kZVVSSUNvbXBvbmVudChtYXRjaFsxXS5yZXBsYWNlKC9cXCsvZywgJyAnKSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfZ2V0RG9tYWluKHVybDogc3RyaW5nKTogc3RyaW5nIHtcbiAgICAgICAgdmFyIGxpbmsgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XG4gICAgICAgIGxpbmsuc2V0QXR0cmlidXRlKCdocmVmJywgdXJsKTtcbiAgICAgICAgXG4gICAgICAgIHJldHVybiBsaW5rLmhvc3RuYW1lO1xuICAgIH1cblxuICAgIHByaXZhdGUgX29uRHVyYXRpb25DaGFuZ2UoKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLl92aWRlby5kdXJhdGlvbiA9PT0gSW5maW5pdHkpIHtcbiAgICAgICAgICAgIHRoaXMuX3BsYXlsaXN0VHlwZSA9ICdMSVZFJztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuX3BsYXlsaXN0VHlwZSA9ICdWT0QnO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCF0aGlzLl9maXJlZFJlYWR5RXZlbnQpIHtcbiAgICAgICAgICAgIHRoaXMuX2ZpcmVkUmVhZHlFdmVudCA9IHRydWU7XG4gICAgICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5SZWFkeSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBzdGF0aWMgZ2V0IEV2ZW50KCkge1xuICAgICAgICByZXR1cm4gRXZlbnRzO1xuICAgIH1cblxuICAgIHB1YmxpYyBzZXRCcm93c2VyKHNhZmFyaTogYm9vbGVhbiwgaWU6IGJvb2xlYW4sIGNocm9tZTogYm9vbGVhbiwgZmlyZWZveDogYm9vbGVhbikge1xuICAgICAgICAvL2RvIG5vdGhpbmdcbiAgICB9XG5cbiAgICBwdWJsaWMgZ2V0VGh1bWJuYWlsKHRpbWU6IG51bWJlciwgc2l6ZTogXCJzbWFsbFwiIHwgXCJsYXJnZVwiKTogdGh1bWIuVGh1bWJuYWlsIHtcbiAgICAgICAgLy9kbyBub3RoaW5nXG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGdldCBkb21haW4oKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2RvbWFpbjtcbiAgICB9XG5cbiAgICBnZXQgc2Vzc2lvbklkKCk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiB0aGlzLl9zZXNzaW9uSWQ7XG4gICAgfVxuXG4gICAgZ2V0IHBsYXlsaXN0VHlwZSgpOiBcIlZPRFwiIHwgXCJFVkVOVFwiIHwgXCJMSVZFXCIge1xuICAgICAgICByZXR1cm4gdGhpcy5fcGxheWxpc3RUeXBlO1xuICAgIH1cblxuICAgIGdldCBkdXJhdGlvbigpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5fdmlkZW8uZHVyYXRpb247XG4gICAgfVxuXG4gICAgZ2V0IHN1cHBvcnRzVGh1bWJuYWlscygpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGdldCBjbGFzc05hbWUoKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuICdOYXRpdmVQbGF5ZXInO1xuICAgIH1cblxuICAgIHByaXZhdGUgX29uSUQzVGFnKGV2ZW50OiBJRDNUYWdFdmVudCk6IHZvaWQge1xuICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5JRDNUYWcsIGV2ZW50KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vblR4eHhJRDNGcmFtZShldmVudDogVHh4eElEM0ZyYW1lRXZlbnQpOiB2b2lkIHtcbiAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuVHh4eElEM0ZyYW1lLCBldmVudCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25Qcml2SUQzRnJhbWUoZXZlbnQ6IFByaXZJRDNGcmFtZUV2ZW50KTogdm9pZCB7XG4gICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLlByaXZJRDNGcmFtZSwgZXZlbnQpO1xuICAgIH1cblxuICAgIHByaXZhdGUgX29uVGV4dElEM0ZyYW1lKGV2ZW50OiBUZXh0SUQzRnJhbWVFdmVudCk6IHZvaWQge1xuICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5UZXh0SUQzRnJhbWUsIGV2ZW50KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vblNsaWNlRW50ZXJlZChldmVudDogU2xpY2VFdmVudCk6IHZvaWQge1xuICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5TbGljZUVudGVyZWQsIGV2ZW50KTtcblxuICAgICAgICBpZiAodGhpcy5fY3VycmVudEFzc2V0SWQgPT09IG51bGwpIHtcbiAgICAgICAgICAgIC8vZmlyc3QgYXNzZXQgaWQgZW5jb3VudGVyZWRcbiAgICAgICAgICAgIHRoaXMuX2Fzc2V0SW5mb1NlcnZpY2UubG9hZEFzc2V0SWQoZXZlbnQuYXNzZXRJZCwgbnVsbCwgKGFzc2V0SW5mbzogQXNzZXRJbmZvKSA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy5fY3VycmVudEFzc2V0SWQgPSBldmVudC5hc3NldElkO1xuICAgICAgICAgICAgICAgIHRoaXMuX29uQXNzZXRFbmNvdW50ZXJlZChldmVudC5jdWUsIGFzc2V0SW5mbyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLl9jdXJyZW50QXNzZXRJZCAhPT0gZXZlbnQuYXNzZXRJZCkge1xuICAgICAgICAgICAgdGhpcy5fYXNzZXRJbmZvU2VydmljZS5sb2FkQXNzZXRJZCh0aGlzLl9jdXJyZW50QXNzZXRJZCwgbnVsbCwgKGN1cnJlbnRBc3NldEluZm86IEFzc2V0SW5mbykgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuX2Fzc2V0SW5mb1NlcnZpY2UubG9hZEFzc2V0SWQoZXZlbnQuYXNzZXRJZCwgbnVsbCwgKG5ld0Fzc2V0SW5mbzogQXNzZXRJbmZvKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2N1cnJlbnRBc3NldElkID0gZXZlbnQuYXNzZXRJZDtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fb25OZXdBc3NldEVuY291bnRlcmVkKGV2ZW50LmN1ZSwgY3VycmVudEFzc2V0SW5mbywgbmV3QXNzZXRJbmZvKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy9zYW1lIGFzc2V0IGlkIGFzIHByZXZpb3VzIG9uZSwgZG8gbm90aGluZ1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25Bc3NldEVuY291bnRlcmVkKGN1ZTogVGV4dFRyYWNrQ3VlLCBhc3NldEluZm86IEFzc2V0SW5mbyk6IHZvaWQge1xuICAgICAgICBsZXQgc2VnbWVudDogU2VnbWVudCA9IHVuZGVmaW5lZDtcblxuICAgICAgICBpZiAoYXNzZXRJbmZvLmlzQWQpIHtcbiAgICAgICAgICAgIHNlZ21lbnQgPSB7XG4gICAgICAgICAgICAgICAgaWQ6IGFzc2V0SW5mby5hc3NldCxcbiAgICAgICAgICAgICAgICBpbmRleDogMCxcbiAgICAgICAgICAgICAgICBzdGFydFRpbWU6IGN1ZS5zdGFydFRpbWUsXG4gICAgICAgICAgICAgICAgZW5kVGltZTogY3VlLnN0YXJ0VGltZSArIGFzc2V0SW5mby5kdXJhdGlvbixcbiAgICAgICAgICAgICAgICB0eXBlOiAnQUQnXG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBsZXQgc2VnbWVudHM6IFNlZ21lbnRbXSA9IFtzZWdtZW50XTtcbiAgICAgICAgICAgIHRoaXMuX2N1cnJlbnRBZEJyZWFrID0gbmV3IEFkQnJlYWsoc2VnbWVudHMpO1xuICAgICAgICAgICAgdGhpcy5faW5BZEJyZWFrID0gdHJ1ZTtcblxuICAgICAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuQXNzZXRFbnRlcmVkLCB7IHNlZ21lbnQ6IHNlZ21lbnQsIGFzc2V0OiBhc3NldEluZm8gfSk7XG4gICAgICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5BZEJyZWFrRW50ZXJlZCwgeyBhZEJyZWFrOiB0aGlzLl9jdXJyZW50QWRCcmVhayB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuX2luQWRCcmVhayA9IGZhbHNlO1xuXG4gICAgICAgICAgICAvL2Rvbid0IGhhdmUgYSBzZWdtZW50IHRvIHBhc3MgYWxvbmcgYmVjYXVzZSB3ZSBkb24ndCBrbm93IHRoZSBkdXJhdGlvbiBvZiB0aGlzIGFzc2V0XG4gICAgICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5Bc3NldEVudGVyZWQsIHsgc2VnbWVudDogdW5kZWZpbmVkLCBhc3NldDogYXNzZXRJbmZvIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfb25OZXdBc3NldEVuY291bnRlcmVkKGN1ZTogVGV4dFRyYWNrQ3VlLCBwcmV2aW91c0Fzc2V0OiBBc3NldEluZm8sIG5ld0Fzc2V0OiBBc3NldEluZm8pOiB2b2lkIHtcbiAgICAgICAgLy93aWxsIHdlIHN0aWxsIGJlIGluIGFuIGFkIGJyZWFrIGFmdGVyIHRoaXMgYXNzZXQ/XG4gICAgICAgIHRoaXMuX2luQWRCcmVhayA9IG5ld0Fzc2V0LmlzQWQ7XG5cbiAgICAgICAgaWYgKHByZXZpb3VzQXNzZXQuaXNBZCAmJiB0aGlzLl9jdXJyZW50QWRCcmVhaykge1xuICAgICAgICAgICAgLy9sZWF2aW5nIGFkIGJyZWFrXG4gICAgICAgICAgICBzdXBlci5maXJlKEV2ZW50cy5Bc3NldEV4aXRlZCwgeyBzZWdtZW50OiB0aGlzLl9jdXJyZW50QWRCcmVhay5nZXRTZWdtZW50QXQoMCksIGFzc2V0OiBwcmV2aW91c0Fzc2V0IH0pO1xuICAgICAgICAgICAgc3VwZXIuZmlyZShFdmVudHMuQWRCcmVha0V4aXRlZCwgeyBhZEJyZWFrOiB0aGlzLl9jdXJyZW50QWRCcmVhayB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vZG9uJ3QgaGF2ZSBhIHNlZ21lbnQgdG8gcGFzcyBhbG9uZyBiZWNhdXNlIHdlIGRvbid0IGtub3cgdGhlIGR1cmF0aW9uIG9mIHRoaXMgYXNzZXRcbiAgICAgICAgICAgIHN1cGVyLmZpcmUoRXZlbnRzLkFzc2V0RXhpdGVkLCB7IHNlZ21lbnQ6IHVuZGVmaW5lZCwgYXNzZXQ6IHByZXZpb3VzQXNzZXQgfSk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHRoaXMuX29uQXNzZXRFbmNvdW50ZXJlZChjdWUsIG5ld0Fzc2V0KTtcbiAgICB9XG5cbiAgICBwdWJsaWMgb25UZXh0VHJhY2tDaGFuZ2VkKGNoYW5nZVRyYWNrRXZlbnQ6IFRyYWNrRXZlbnQpOiB2b2lkIHtcbiAgICAgICAgLy9kbyBub3RoaW5nXG4gICAgfVxuXG4gICAgZ2V0IHZlcnNpb24oKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuICcwMi4wMC4xNzA4MDgwMCc7IC8vd2lsbCBiZSBtb2RpZmllZCBieSB0aGUgYnVpbGQgc2NyaXB0XG4gICAgfVxufSIsIlxuLy9wb2x5ZmlsbCBBcnJheS5maW5kKClcbi8vaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvSmF2YVNjcmlwdC9SZWZlcmVuY2UvR2xvYmFsX09iamVjdHMvQXJyYXkvZmluZFxuLy8gaHR0cHM6Ly90YzM5LmdpdGh1Yi5pby9lY21hMjYyLyNzZWMtYXJyYXkucHJvdG90eXBlLmZpbmRcbmlmICghQXJyYXkucHJvdG90eXBlLmZpbmQpIHtcbiAgT2JqZWN0LmRlZmluZVByb3BlcnR5KEFycmF5LnByb3RvdHlwZSwgJ2ZpbmQnLCB7XG4gICAgdmFsdWU6IGZ1bmN0aW9uKHByZWRpY2F0ZTphbnkpIHtcbiAgICAgLy8gMS4gTGV0IE8gYmUgPyBUb09iamVjdCh0aGlzIHZhbHVlKS5cbiAgICAgIGlmICh0aGlzID09IG51bGwpIHtcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignXCJ0aGlzXCIgaXMgbnVsbCBvciBub3QgZGVmaW5lZCcpO1xuICAgICAgfVxuXG4gICAgICB2YXIgbyA9IE9iamVjdCh0aGlzKTtcblxuICAgICAgLy8gMi4gTGV0IGxlbiBiZSA/IFRvTGVuZ3RoKD8gR2V0KE8sIFwibGVuZ3RoXCIpKS5cbiAgICAgIHZhciBsZW4gPSBvLmxlbmd0aCA+Pj4gMDtcblxuICAgICAgLy8gMy4gSWYgSXNDYWxsYWJsZShwcmVkaWNhdGUpIGlzIGZhbHNlLCB0aHJvdyBhIFR5cGVFcnJvciBleGNlcHRpb24uXG4gICAgICBpZiAodHlwZW9mIHByZWRpY2F0ZSAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdwcmVkaWNhdGUgbXVzdCBiZSBhIGZ1bmN0aW9uJyk7XG4gICAgICB9XG5cbiAgICAgIC8vIDQuIElmIHRoaXNBcmcgd2FzIHN1cHBsaWVkLCBsZXQgVCBiZSB0aGlzQXJnOyBlbHNlIGxldCBUIGJlIHVuZGVmaW5lZC5cbiAgICAgIHZhciB0aGlzQXJnID0gYXJndW1lbnRzWzFdO1xuXG4gICAgICAvLyA1LiBMZXQgayBiZSAwLlxuICAgICAgdmFyIGsgPSAwO1xuXG4gICAgICAvLyA2LiBSZXBlYXQsIHdoaWxlIGsgPCBsZW5cbiAgICAgIHdoaWxlIChrIDwgbGVuKSB7XG4gICAgICAgIC8vIGEuIExldCBQayBiZSAhIFRvU3RyaW5nKGspLlxuICAgICAgICAvLyBiLiBMZXQga1ZhbHVlIGJlID8gR2V0KE8sIFBrKS5cbiAgICAgICAgLy8gYy4gTGV0IHRlc3RSZXN1bHQgYmUgVG9Cb29sZWFuKD8gQ2FsbChwcmVkaWNhdGUsIFQsIMKrIGtWYWx1ZSwgaywgTyDCuykpLlxuICAgICAgICAvLyBkLiBJZiB0ZXN0UmVzdWx0IGlzIHRydWUsIHJldHVybiBrVmFsdWUuXG4gICAgICAgIHZhciBrVmFsdWUgPSBvW2tdO1xuICAgICAgICBpZiAocHJlZGljYXRlLmNhbGwodGhpc0FyZywga1ZhbHVlLCBrLCBvKSkge1xuICAgICAgICAgIHJldHVybiBrVmFsdWU7XG4gICAgICAgIH1cbiAgICAgICAgLy8gZS4gSW5jcmVhc2UgayBieSAxLlxuICAgICAgICBrKys7XG4gICAgICB9XG5cbiAgICAgIC8vIDcuIFJldHVybiB1bmRlZmluZWQuXG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgfSk7XG59IiwiXG4vL3BvbHlmaWxsIGZvciBPYmplY3QuYXNzaWduKCkgZm9yIElFMTFcbi8vaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvSmF2YVNjcmlwdC9SZWZlcmVuY2UvR2xvYmFsX09iamVjdHMvT2JqZWN0L2Fzc2lnblxuaWYgKHR5cGVvZiBPYmplY3QuYXNzaWduICE9ICdmdW5jdGlvbicpIHtcbiAgKGZ1bmN0aW9uICgpIHtcbiAgICBPYmplY3QuYXNzaWduID0gZnVuY3Rpb24gKHRhcmdldDogYW55KSB7XG4gICAgICAndXNlIHN0cmljdCc7XG4gICAgICAvLyBXZSBtdXN0IGNoZWNrIGFnYWluc3QgdGhlc2Ugc3BlY2lmaWMgY2FzZXMuXG4gICAgICBpZiAodGFyZ2V0ID09PSB1bmRlZmluZWQgfHwgdGFyZ2V0ID09PSBudWxsKSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0Nhbm5vdCBjb252ZXJ0IHVuZGVmaW5lZCBvciBudWxsIHRvIG9iamVjdCcpO1xuICAgICAgfVxuXG4gICAgICB2YXIgb3V0cHV0ID0gT2JqZWN0KHRhcmdldCk7XG4gICAgICBmb3IgKHZhciBpbmRleCA9IDE7IGluZGV4IDwgYXJndW1lbnRzLmxlbmd0aDsgaW5kZXgrKykge1xuICAgICAgICB2YXIgc291cmNlID0gYXJndW1lbnRzW2luZGV4XTtcbiAgICAgICAgaWYgKHNvdXJjZSAhPT0gdW5kZWZpbmVkICYmIHNvdXJjZSAhPT0gbnVsbCkge1xuICAgICAgICAgIGZvciAodmFyIG5leHRLZXkgaW4gc291cmNlKSB7XG4gICAgICAgICAgICBpZiAoc291cmNlLmhhc093blByb3BlcnR5KG5leHRLZXkpKSB7XG4gICAgICAgICAgICAgIG91dHB1dFtuZXh0S2V5XSA9IHNvdXJjZVtuZXh0S2V5XTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBvdXRwdXQ7XG4gICAgfTtcbiAgfSkoKTtcbn0iLCJcbi8vcG9seWZpbGwgZm9yIFZUVEN1ZSBmb3IgTVMgRWRnZSBhbmQgSUUxMVxuKGZ1bmN0aW9uICgpIHtcbiAgICAoPGFueT53aW5kb3cpLlZUVEN1ZSA9ICg8YW55PndpbmRvdykuVlRUQ3VlIHx8ICg8YW55PndpbmRvdykuVGV4dFRyYWNrQ3VlO1xufSkoKTtcbiIsImltcG9ydCAnLi9wb2x5ZmlsbC92dHQtY3VlJztcbmltcG9ydCAnLi9wb2x5ZmlsbC9vYmplY3QnO1xuaW1wb3J0ICcuL3BvbHlmaWxsL2FycmF5JztcbmltcG9ydCB7IFBsYXllciB9IGZyb20gJy4vcGxheWVyJztcbmltcG9ydCB7IEFkYXB0aXZlUGxheWVyIH0gZnJvbSAnLi9hZGFwdGl2ZS1wbGF5ZXInO1xuaW1wb3J0IHsgTmF0aXZlUGxheWVyIH0gZnJvbSAnLi9uYXRpdmUtcGxheWVyJztcblxuXG5mdW5jdGlvbiBpc05hdGl2ZVBsYXliYWNrU3VwcG9ydGVkKCk6IGJvb2xlYW4ge1xuICAgIHRyeSB7XG4gICAgICAgIGxldCB2aWRlbyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3ZpZGVvJyk7XG5cbiAgICAgICAgaWYgKHZpZGVvLmNhblBsYXlUeXBlKSB7XG4gICAgICAgICAgICByZXR1cm4gdmlkZW8uY2FuUGxheVR5cGUoJ2FwcGxpY2F0aW9uL3ZuZC5hcHBsZS5tcGVndXJsJykgIT09ICcnO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgcmV0dXJuIGZhbHNlO1xufVxuXG5mdW5jdGlvbiBpc0h0bWxQbGF5YmFja1N1cHBvcnRlZCgpOiBib29sZWFuIHtcbiAgICBpZiAoJ01lZGlhU291cmNlJyBpbiB3aW5kb3cgJiYgTWVkaWFTb3VyY2UuaXNUeXBlU3VwcG9ydGVkKSB7XG4gICAgICAgIHJldHVybiBNZWRpYVNvdXJjZS5pc1R5cGVTdXBwb3J0ZWQoJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40MkUwMUUsbXA0YS40MC4yXCInKTtcbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIGN1cnJlbnRTY3JpcHQoKSB7XG4gICAgLy9oYWNreSwgYnV0IHdvcmtzIGZvciBvdXIgbmVlZHNcbiAgICBjb25zdCBzY3JpcHRzID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ3NjcmlwdCcpO1xuICAgIGlmIChzY3JpcHRzICYmIHNjcmlwdHMubGVuZ3RoKSB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc2NyaXB0cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgaWYgKHNjcmlwdHNbaV0uc3JjLmluZGV4T2YoJ3VwbHluay1jb3JlLmpzJykgPiAtMSB8fCBzY3JpcHRzW2ldLnNyYy5pbmRleE9mKCd1cGx5bmstY29yZS5taW4uanMnKSA+IC0xKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNjcmlwdHNbaV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gdW5kZWZpbmVkO1xufVxuXG52YXIgbG9hZGVkVXBseW5rQWRhcHRpdmUgPSB0cnVlO1xuXG5mdW5jdGlvbiBsb2FkVXBseW5rQWRhcHRpdmVQbGF5ZXIodmlkZW86IEhUTUxWaWRlb0VsZW1lbnQsIG9wdGlvbnM/OiBQbGF5ZXJPcHRpb25zLCBjYWxsYmFjaz86IChwbGF5ZXI6IFBsYXllcikgPT4gdm9pZCkge1xuXG4gICAgLy9sb2FkIHVwbHluay1hZGFwdGl2ZS5qc1xuICAgIGxldCB1cmwgPSBjdXJyZW50U2NyaXB0KCkuc3JjLnN1YnN0cmluZygwLCBjdXJyZW50U2NyaXB0KCkuc3JjLmxhc3RJbmRleE9mKCcvJykgKyAxKSArICd1cGx5bmstYWRhcHRpdmUuanMnO1xuXG4gICAgLy8gaWYgdXNpbmcgV2ViQXNzZW1ibHksIHRoZSB3YXNtIGlzIGFscmVhZHkgbG9hZGVkIGZyb20gdGhlIGh0bWxcbiAgICBsZXQgZW5hYmxlV0FTTSA9IGZhbHNlO1xuICAgIGlmIChlbmFibGVXQVNNICYmIHR5cGVvZiBXZWJBc3NlbWJseSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgY2FsbGJhY2sobmV3IEFkYXB0aXZlUGxheWVyKHZpZGVvLCBvcHRpb25zKSk7XG4gICAgfVxuICAgIGVsc2UgaWYgKCFpc1NjcmlwdEFscmVhZHlJbmNsdWRlZCh1cmwpKSB7XG4gICAgICAgIGxvYWRlZFVwbHlua0FkYXB0aXZlID0gZmFsc2U7XG4gICAgICAgIGxvYWRTY3JpcHRBc3luYyh1cmwsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGxvYWRlZFVwbHlua0FkYXB0aXZlID0gdHJ1ZTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG5ldyBBZGFwdGl2ZVBsYXllcih2aWRlbywgb3B0aW9ucykpO1xuICAgICAgICB9KTtcbiAgICB9IGVsc2UgaWYgKGxvYWRlZFVwbHlua0FkYXB0aXZlKSB7XG4gICAgICAgIGNhbGxiYWNrKG5ldyBBZGFwdGl2ZVBsYXllcih2aWRlbywgb3B0aW9ucykpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIC8vc2NyaXB0IGlzIGxvYWRpbmcgc28gd2UnbGwga2VlcCBjaGVja2luZyBpdCdzXG4gICAgICAgIC8vIHN0YXR1cyBiZWZvcmUgZmlyaW5nIHRoZSBjYWxsYmFja1xuICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGxvYWRVcGx5bmtBZGFwdGl2ZVBsYXllcih2aWRlbywgb3B0aW9ucywgY2FsbGJhY2spO1xuICAgICAgICB9LCA1MDApO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gbG9hZFNjcmlwdEFzeW5jKHVybDogc3RyaW5nLCBjYWxsYmFjazogKCkgPT4gdm9pZCk6IHZvaWQge1xuICAgIGxldCBoZWFkID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ2hlYWQnKVswXTtcbiAgICBsZXQgc2NyaXB0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc2NyaXB0Jyk7XG5cbiAgICBzY3JpcHQudHlwZSA9ICd0ZXh0L2phdmFzY3JpcHQnO1xuICAgIHNjcmlwdC5zcmMgPSB1cmw7XG5cbiAgICBzY3JpcHQub25sb2FkID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBjYWxsYmFjaygpO1xuICAgIH07XG5cbiAgICBoZWFkLmFwcGVuZENoaWxkKHNjcmlwdCk7XG59XG5cbmZ1bmN0aW9uIGlzU2NyaXB0QWxyZWFkeUluY2x1ZGVkKHVybDogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgdmFyIHNjcmlwdHMgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZShcInNjcmlwdFwiKTtcbiAgICBpZiAoc2NyaXB0cyAmJiBzY3JpcHRzLmxlbmd0aCkge1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHNjcmlwdHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGlmIChzY3JpcHRzW2ldLnNyYyA9PT0gdXJsKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUFkYXB0aXZlUGxheWVyKHZpZGVvOiBIVE1MVmlkZW9FbGVtZW50LCBvcHRpb25zOiBhbnksIGNhbGxiYWNrPzogKHBsYXllcjogUGxheWVyKSA9PiB2b2lkKSB7XG5cbiAgICBpZiAob3B0aW9ucy5wcmVmZXJOYXRpdmVQbGF5YmFjaykge1xuICAgICAgICBpZiAoaXNOYXRpdmVQbGF5YmFja1N1cHBvcnRlZCgpKSB7XG4gICAgICAgICAgICAvL2NvbnNvbGUubG9nKFwidXNpbmcgbmF0aXZlIHBsYXliYWNrXCIpO1xuICAgICAgICAgICAgY2FsbGJhY2sobmV3IE5hdGl2ZVBsYXllcih2aWRlbywgb3B0aW9ucykpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9IGVsc2UgaWYgKGlzSHRtbFBsYXliYWNrU3VwcG9ydGVkKCkpIHtcbiAgICAgICAgICAgIC8vY29uc29sZS5sb2coXCJmYWxsaW5nIGJhY2sgdG8gdXBseW5rIHBsYXllclwiKTtcbiAgICAgICAgICAgIGxvYWRVcGx5bmtBZGFwdGl2ZVBsYXllcih2aWRlbywgb3B0aW9ucywgY2FsbGJhY2spO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKGlzSHRtbFBsYXliYWNrU3VwcG9ydGVkKCkpIHtcbiAgICAgICAgICAgIC8vY29uc29sZS5sb2coXCJ1c2luZyB1cGx5bmsgcGxheWVyXCIpO1xuICAgICAgICAgICAgbG9hZFVwbHlua0FkYXB0aXZlUGxheWVyKHZpZGVvLCBvcHRpb25zLCBjYWxsYmFjayk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gZWxzZSBpZiAoaXNOYXRpdmVQbGF5YmFja1N1cHBvcnRlZCgpKSB7XG4gICAgICAgICAgICAvL2NvbnNvbGUubG9nKFwiZmFsbGluZyBiYWNrIHRvIG5hdGl2ZSBwbGF5YmFja1wiKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG5ldyBOYXRpdmVQbGF5ZXIodmlkZW8sIG9wdGlvbnMpKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgIH1cbiAgICBjb25zb2xlLndhcm4oXCJubyBwbGF5YmFjayBtb2RlIHN1cHBvcnRlZFwiKTtcbiAgICBjYWxsYmFjayh1bmRlZmluZWQpO1xufVxuXG4oPGFueT53aW5kb3cpLmNyZWF0ZUFkYXB0aXZlUGxheWVyID0gY3JlYXRlQWRhcHRpdmVQbGF5ZXI7XG4oPGFueT53aW5kb3cpLkFkYXB0aXZlUGxheWVyID0gQWRhcHRpdmVQbGF5ZXI7XG4iLCJpbXBvcnQgeyBTdHJpbmdNYXAgfSBmcm9tICcuL3N0cmluZy1tYXAnO1xuXG4vL2h0dHA6Ly93d3cuZGF0Y2hsZXkubmFtZS9lczYtZXZlbnRlbWl0dGVyL1xuLy9odHRwczovL2dpc3QuZ2l0aHViLmNvbS9kYXRjaGxleS8zNzM1M2Q2YTJjYjYyOTY4N2ViOVxuLy9odHRwOi8vY29kZXBlbi5pby95dWt1bGVsZS9wZW4veU5WVnhWLz9lZGl0b3JzPTAwMVxuZXhwb3J0IGNsYXNzIE9ic2VydmFibGUge1xuICAgIHByaXZhdGUgX2xpc3RlbmVyczogU3RyaW5nTWFwPGFueT47XG5cbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgdGhpcy5fbGlzdGVuZXJzID0gbmV3IFN0cmluZ01hcCgpO1xuICAgIH1cblxuICAgIG9uKGxhYmVsOiBzdHJpbmcsIGNhbGxiYWNrOiBhbnkpIHtcbiAgICAgICAgdGhpcy5fbGlzdGVuZXJzLmhhcyhsYWJlbCkgfHwgdGhpcy5fbGlzdGVuZXJzLnNldChsYWJlbCwgW10pO1xuICAgICAgICB0aGlzLl9saXN0ZW5lcnMuZ2V0KGxhYmVsKS5wdXNoKGNhbGxiYWNrKTtcbiAgICB9XG5cbiAgICBvZmYobGFiZWw6IHN0cmluZywgY2FsbGJhY2s6IGFueSkge1xuICAgICAgICBsZXQgbGlzdGVuZXJzID0gdGhpcy5fbGlzdGVuZXJzLmdldChsYWJlbCk7XG4gICAgICAgIGxldCBpbmRleDogbnVtYmVyO1xuXG4gICAgICAgIGlmIChsaXN0ZW5lcnMgJiYgbGlzdGVuZXJzLmxlbmd0aCkge1xuICAgICAgICAgICAgaW5kZXggPSBsaXN0ZW5lcnMucmVkdWNlKChpOiBudW1iZXIsIGxpc3RlbmVyOiBhbnksIGluZGV4OiBudW1iZXIpID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gKHRoaXMuX2lzRnVuY3Rpb24obGlzdGVuZXIpICYmIGxpc3RlbmVyID09PSBjYWxsYmFjaykgPyBpID0gaW5kZXggOiBpO1xuICAgICAgICAgICAgfSwgLTEpO1xuXG4gICAgICAgICAgICBpZiAoaW5kZXggPiAtMSkge1xuICAgICAgICAgICAgICAgIGxpc3RlbmVycy5zcGxpY2UoaW5kZXgsIDEpO1xuICAgICAgICAgICAgICAgIHRoaXMuX2xpc3RlbmVycy5zZXQobGFiZWwsIGxpc3RlbmVycyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGZpcmUobGFiZWw6IHN0cmluZywgLi4uYXJnczogYW55W10pIHtcbiAgICAgICAgbGV0IGxpc3RlbmVycyA9IHRoaXMuX2xpc3RlbmVycy5nZXQobGFiZWwpO1xuXG4gICAgICAgIGlmIChsaXN0ZW5lcnMgJiYgbGlzdGVuZXJzLmxlbmd0aCkge1xuICAgICAgICAgICAgbGlzdGVuZXJzLmZvckVhY2goKGxpc3RlbmVyOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBsaXN0ZW5lciguLi5hcmdzKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIHByaXZhdGUgX2lzRnVuY3Rpb24ob2JqOiBhbnkpIHtcbiAgICAgICAgcmV0dXJuIHR5cGVvZiBvYmogPT0gJ2Z1bmN0aW9uJyB8fCBmYWxzZTtcbiAgICB9XG59IiwiaW1wb3J0IHsgQWRCcmVhayB9IGZyb20gJy4uL2FkL2FkLWJyZWFrJztcblxuZXhwb3J0IGNsYXNzIFNlZ21lbnRNYXAge1xuICAgIHByaXZhdGUgcmVhZG9ubHkgX3NlZ21lbnRzOiBTZWdtZW50W107XG4gICAgcHJpdmF0ZSByZWFkb25seSBfYWRCcmVha3M6IEFkQnJlYWtbXTtcblxuICAgIGNvbnN0cnVjdG9yKHNlZ21lbnRzOiBTZWdtZW50W10pIHtcbiAgICAgICAgdGhpcy5fc2VnbWVudHMgPSBzZWdtZW50cztcbiAgICAgICAgdGhpcy5fYWRCcmVha3MgPSBbXTtcbiAgICAgICAgdGhpcy5faW5pdEFkYnJlYWtzKCk7XG4gICAgfVxuXG4gICAgZmluZFNlZ21lbnQodGltZTogbnVtYmVyKTogU2VnbWVudCB8IHVuZGVmaW5lZCB7XG4gICAgICAgIGxldCBpbmRleCA9IHRoaXMuZ2V0U2VnbWVudEluZGV4QXQodGltZSk7XG4gICAgICAgIHJldHVybiB0aGlzLmdldFNlZ21lbnRBdChpbmRleCk7XG4gICAgfVxuXG4gICAgZ2V0U2VnbWVudEF0KGluZGV4OiBudW1iZXIpOiBTZWdtZW50IHtcbiAgICAgICAgaWYgKGluZGV4ID49IDAgJiYgaW5kZXggPCB0aGlzLl9zZWdtZW50cy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9zZWdtZW50c1tpbmRleF07XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIGdldFNlZ21lbnRJbmRleEF0KHRpbWU6IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fc2VnbWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGxldCBzZWdtZW50ID0gdGhpcy5fc2VnbWVudHNbaV07XG4gICAgICAgICAgICBpZiAoc2VnbWVudC5zdGFydFRpbWUgPD0gdGltZSAmJiB0aW1lIDw9IHNlZ21lbnQuZW5kVGltZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIC0xO1xuICAgIH1cblxuICAgIGdldCBsZW5ndGgoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3NlZ21lbnRzLmxlbmd0aDtcbiAgICB9XG5cbiAgICBnZXQgYWRCcmVha3MoKTogQWRCcmVha1tdIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkQnJlYWtzO1xuICAgIH1cblxuICAgIGdldCBjb250ZW50U2VnbWVudHMoKTogU2VnbWVudFtdIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3NlZ21lbnRzLmZpbHRlcihTZWdtZW50TWFwLmlzQ29udGVudCk7XG4gICAgfVxuXG4gICAgc3RhdGljIGlzQWQoc2VnbWVudDogU2VnbWVudCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gc2VnbWVudC50eXBlID09PSBcIkFEXCI7XG4gICAgfVxuXG4gICAgc3RhdGljIGlzQ29udGVudChzZWdtZW50OiBTZWdtZW50KTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiBzZWdtZW50LnR5cGUgPT09IFwiQ09OVEVOVFwiO1xuICAgIH1cblxuICAgIHByaXZhdGUgX2luaXRBZGJyZWFrcygpOiB2b2lkIHtcbiAgICAgICAgbGV0IGFkczogU2VnbWVudFtdID0gW107XG5cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9zZWdtZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgd2hpbGUgKGkgPCB0aGlzLl9zZWdtZW50cy5sZW5ndGggJiYgU2VnbWVudE1hcC5pc0FkKHRoaXMuX3NlZ21lbnRzW2ldKSkge1xuICAgICAgICAgICAgICAgIGFkcy5wdXNoKHRoaXMuX3NlZ21lbnRzW2ldKTtcbiAgICAgICAgICAgICAgICBpKytcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGFkcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fYWRCcmVha3MucHVzaChuZXcgQWRCcmVhayhhZHMpKTtcbiAgICAgICAgICAgICAgICBhZHMgPSBbXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGluQWRCcmVhayh0aW1lOiBudW1iZXIpOiBib29sZWFuIHtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9hZEJyZWFrcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgbGV0IGFkQnJlYWsgPSB0aGlzLl9hZEJyZWFrc1tpXTtcbiAgICAgICAgICAgIGlmIChhZEJyZWFrLmNvbnRhaW5zKHRpbWUpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgZ2V0QWRCcmVhayh0aW1lOiBudW1iZXIpOiBBZEJyZWFrIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkQnJlYWtzLmZpbmQoKGFkQnJlYWs6IEFkQnJlYWspOiBib29sZWFuID0+IHtcbiAgICAgICAgICAgIHJldHVybiBhZEJyZWFrLmNvbnRhaW5zKHRpbWUpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBnZXRBZEJyZWFrc0JldHdlZW4oc3RhcnQ6IG51bWJlciwgZW5kOiBudW1iZXIpOiBBZEJyZWFrW10ge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRCcmVha3MuZmlsdGVyKChhZEJyZWFrOiBBZEJyZWFrKTogYm9vbGVhbiA9PiB7XG4gICAgICAgICAgICByZXR1cm4gc3RhcnQgPD0gYWRCcmVhay5zdGFydFRpbWUgJiYgYWRCcmVhay5lbmRUaW1lIDw9IGVuZDtcbiAgICAgICAgfSk7XG4gICAgfVxufSIsImV4cG9ydCBjbGFzcyBTdHJpbmdNYXA8Vj4ge1xuICAgIHByaXZhdGUgX21hcDogYW55O1xuXG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHRoaXMuX21hcCA9IG5ldyBPYmplY3QoKTtcbiAgICB9XG5cbiAgICBnZXQgc2l6ZSgpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gT2JqZWN0LmtleXModGhpcy5fbWFwKS5sZW5ndGg7XG4gICAgfVxuXG4gICAgaGFzKGtleTogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLl9tYXAuaGFzT3duUHJvcGVydHkoa2V5KTtcbiAgICB9XG5cbiAgICBnZXQoa2V5OiBzdHJpbmcpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX21hcFtrZXldO1xuICAgIH1cblxuICAgIHNldChrZXk6IHN0cmluZywgdmFsdWU6IFYpIHtcbiAgICAgICAgdGhpcy5fbWFwW2tleV0gPSB2YWx1ZTtcbiAgICB9XG5cbiAgICBjbGVhcigpOiB2b2lkIHtcbiAgICAgICAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKHRoaXMuX21hcCk7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwga2V5cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgY29uc3Qga2V5ID0ga2V5c1tpXTtcbiAgICAgICAgICAgIHRoaXMuX21hcFtrZXldID0gbnVsbDtcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLl9tYXBba2V5XTtcbiAgICAgICAgfVxuICAgIH1cbn0iLCJpbXBvcnQgeyB0b0hleFN0cmluZyB9IGZyb20gJy4vdXRpbHMnO1xuaW1wb3J0IHsgVGh1bWIsIEFzc2V0SW5mbywgQXNzZXRJbmZvU2VydmljZSB9IGZyb20gJy4uL3dlYi1zZXJ2aWNlcy9hc3NldC1pbmZvLXNlcnZpY2UnO1xuaW1wb3J0IHsgU2VnbWVudE1hcCB9IGZyb20gJy4vc2VnbWVudC1tYXAnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFRodW1ibmFpbCB7XG4gICAgdXJsOiBzdHJpbmc7XG4gICAgaGVpZ2h0OiBudW1iZXI7XG4gICAgd2lkdGg6IG51bWJlcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFRodW1ibmFpbCh0aW1lOiBudW1iZXIsIHNlZ21lbnRzOiBTZWdtZW50TWFwLCBhc3NldEluZm9TZXJ2aWNlOiBBc3NldEluZm9TZXJ2aWNlLCB0aHVtYm5haWxTaXplOiBcInNtYWxsXCIgfCBcImxhcmdlXCIgPSBcInNtYWxsXCIpOiBUaHVtYm5haWwge1xuICAgIGlmIChpc05hTih0aW1lKSB8fCB0aW1lIDwgMCkge1xuICAgICAgICB0aW1lID0gMDtcbiAgICB9XG5cbiAgICBjb25zdCBzZWdtZW50ID0gc2VnbWVudHMuZmluZFNlZ21lbnQodGltZSk7XG4gICAgaWYgKHNlZ21lbnQpIHtcbiAgICAgICAgY29uc3QgYXNzZXQgPSBhc3NldEluZm9TZXJ2aWNlLmdldEFzc2V0SW5mbyhzZWdtZW50LmlkKTtcbiAgICAgICAgaWYgKGFzc2V0ICYmIGFzc2V0LnRodW1icykge1xuICAgICAgICAgICAgY29uc3Qgc2xpY2VOdW1iZXIgPSBnZXRTbGljZU51bWJlcih0aW1lLCBzZWdtZW50LCBhc3NldCk7XG4gICAgICAgICAgICBjb25zdCB0aHVtYiA9IGdldFRodW1iKGFzc2V0LCB0aHVtYm5haWxTaXplKTtcblxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICB1cmw6IGdldFRodW1ibmFpbFVybChhc3NldCwgc2xpY2VOdW1iZXIsIHRodW1iKSxcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IHRodW1iLmhlaWdodCxcbiAgICAgICAgICAgICAgICB3aWR0aDogdGh1bWIud2lkdGhcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICAgIHVybDogJycsXG4gICAgICAgIGhlaWdodDogMCxcbiAgICAgICAgd2lkdGg6IDBcbiAgICB9O1xufVxuXG5mdW5jdGlvbiBnZXRUaHVtYm5haWxVcmwoYXNzZXQ6IEFzc2V0SW5mbywgc2xpY2VOdW1iZXI6IG51bWJlciwgdGh1bWI6IFRodW1iKTogc3RyaW5nIHtcbiAgICBsZXQgcHJlZml4ID0gYXNzZXQudGh1bWJQcmVmaXg7XG5cbiAgICBpZiAoYXNzZXQuc3RvcmFnZVBhcnRpdGlvbnMgJiYgYXNzZXQuc3RvcmFnZVBhcnRpdGlvbnMubGVuZ3RoKSB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYXNzZXQuc3RvcmFnZVBhcnRpdGlvbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IHBhcnRpdGlvbiA9IGFzc2V0LnN0b3JhZ2VQYXJ0aXRpb25zW2ldO1xuICAgICAgICAgICAgaWYgKHBhcnRpdGlvbi5zdGFydCA8PSBzbGljZU51bWJlciAmJiBzbGljZU51bWJlciA8IHBhcnRpdGlvbi5lbmQpIHtcbiAgICAgICAgICAgICAgICBwcmVmaXggPSBwYXJ0aXRpb24udXJsO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHByZWZpeFtwcmVmaXgubGVuZ3RoIC0gMV0gIT09ICcvJykge1xuICAgICAgICBwcmVmaXggKz0gJy8nO1xuICAgIH1cblxuICAgIGNvbnN0IHNsaWNlSGV4TnVtYmVyID0gdG9IZXhTdHJpbmcoc2xpY2VOdW1iZXIpO1xuXG4gICAgcmV0dXJuIGAke3ByZWZpeH0ke3RodW1iLnByZWZpeH0ke3NsaWNlSGV4TnVtYmVyfS5qcGdgO1xufVxuXG5mdW5jdGlvbiBnZXRUaHVtYihhc3NldDogQXNzZXRJbmZvLCBzaXplOiAnc21hbGwnIHwgJ2xhcmdlJyk6IFRodW1iIHtcbiAgICAvL2RlZmF1bHQgdG8gc21hbGxlc3QgdGh1bWJcbiAgICBsZXQgdGh1bWI6IFRodW1iID0gYXNzZXQudGh1bWJzWzBdO1xuXG4gICAgaWYgKHNpemUgPT09IFwibGFyZ2VcIikge1xuICAgICAgICAvL2xhc3QgdGh1bWIgaXMgdGhlIGxhcmdlc3RcbiAgICAgICAgdGh1bWIgPSBhc3NldC50aHVtYnNbYXNzZXQudGh1bWJzLmxlbmd0aCAtIDFdO1xuICAgIH1cblxuICAgIHJldHVybiB0aHVtYjtcbn1cblxuXG5mdW5jdGlvbiBnZXRTbGljZU51bWJlcih0aW1lOiBudW1iZXIsIHNlZ21lbnQ6IFNlZ21lbnQsIGFzc2V0OiBBc3NldEluZm8pOiBudW1iZXIge1xuICAgIGxldCBzbGljZU51bWJlciA9IE1hdGguY2VpbCgodGltZSAtIHNlZ21lbnQuc3RhcnRUaW1lKSAvIGFzc2V0LnNsaWNlRHVyYXRpb24pO1xuICAgIHNsaWNlTnVtYmVyICs9IHNlZ21lbnQuaW5kZXg7XG5cbiAgICBpZiAoc2xpY2VOdW1iZXIgPiBhc3NldC5tYXhTbGljZSkge1xuICAgICAgICBzbGljZU51bWJlciA9IGFzc2V0Lm1heFNsaWNlO1xuICAgIH1cblxuICAgIHJldHVybiBzbGljZU51bWJlcjtcbn1cbiIsImV4cG9ydCBmdW5jdGlvbiB0b1RpbWVTdHJpbmcodGltZTogbnVtYmVyKSB7XG4gICAgaWYgKGlzTmFOKHRpbWUpKSB7XG4gICAgICAgIHRpbWUgPSAwO1xuICAgIH1cblxuICAgIGxldCBuZWdhdGl2ZSA9ICh0aW1lIDwgMCkgPyBcIi1cIiA6IFwiXCI7XG5cbiAgICB0aW1lID0gTWF0aC5hYnModGltZSk7XG5cbiAgICBsZXQgc2Vjb25kcyA9ICh0aW1lICUgNjApIHwgMDtcbiAgICBsZXQgbWludXRlcyA9ICgodGltZSAvIDYwKSAlIDYwKSB8IDA7XG4gICAgbGV0IGhvdXJzID0gKCgodGltZSAvIDYwKSAvIDYwKSAlIDYwKSB8IDA7XG4gICAgbGV0IHNob3dIb3VycyA9IGhvdXJzID4gMDtcblxuICAgIGxldCBoclN0ciA9IGhvdXJzIDwgMTAgPyBgMCR7aG91cnN9YCA6IGAke2hvdXJzfWA7XG4gICAgbGV0IG1pblN0ciA9IG1pbnV0ZXMgPCAxMCA/IGAwJHttaW51dGVzfWAgOiBgJHttaW51dGVzfWA7XG4gICAgbGV0IHNlY1N0ciA9IHNlY29uZHMgPCAxMCA/IGAwJHtzZWNvbmRzfWAgOiBgJHtzZWNvbmRzfWA7XG5cbiAgICBpZiAoc2hvd0hvdXJzKSB7XG4gICAgICAgIHJldHVybiBgJHtuZWdhdGl2ZX0ke2hyU3RyfToke21pblN0cn06JHtzZWNTdHJ9YDtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gYCR7bmVnYXRpdmV9JHttaW5TdHJ9OiR7c2VjU3RyfWA7XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gdG9IZXhTdHJpbmcobnVtYmVyOiBudW1iZXIsIG1pbkxlbmd0aCA9IDgpOiBzdHJpbmcge1xuICAgIGxldCBoZXggPSBudW1iZXIudG9TdHJpbmcoMTYpLnRvVXBwZXJDYXNlKCk7XG4gICAgd2hpbGUgKGhleC5sZW5ndGggPCBtaW5MZW5ndGgpIHtcbiAgICAgICAgaGV4ID0gXCIwXCIgKyBoZXg7XG4gICAgfVxuXG4gICAgcmV0dXJuIGhleDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGJhc2U2NFRvQnVmZmVyKGI2NGVuY29kZWQ6IHN0cmluZyk6IFVpbnQ4QXJyYXkge1xuICAgIHJldHVybiBuZXcgVWludDhBcnJheShhdG9iKGI2NGVuY29kZWQpLnNwbGl0KFwiXCIpLm1hcChmdW5jdGlvbiAoYykgeyByZXR1cm4gYy5jaGFyQ29kZUF0KDApOyB9KSlcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNsaWNlKGRhdGE6IFVpbnQ4QXJyYXksIHN0YXJ0OiBudW1iZXIsIGVuZD86IG51bWJlcik6IFVpbnQ4QXJyYXkge1xuICAgIC8vSUUgMTEgZG9lc24ndCBzdXBwb3J0IHNsaWNlKCkgb24gVHlwZWRBcnJheSBvYmplY3RzXG4gICAgaWYgKGRhdGEuc2xpY2UpIHtcbiAgICAgICAgcmV0dXJuIGRhdGEuc2xpY2Uoc3RhcnQsIGVuZCk7XG4gICAgfVxuXG4gICAgaWYgKGVuZCkge1xuICAgICAgICByZXR1cm4gZGF0YS5zdWJhcnJheShzdGFydCwgZW5kKTtcbiAgICB9XG5cbiAgICByZXR1cm4gZGF0YS5zdWJhcnJheShzdGFydCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0xvY2FsU3RvcmFnZUF2YWlsYWJsZSgpXG57XG4gICAgLy8gQ29waWVkIGZyb20gUGx5ciBjb2RlXG4gICAgaWYgKCEoJ2xvY2FsU3RvcmFnZScgaW4gd2luZG93KSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgLy8gVHJ5IHRvIHVzZSBpdCAoaXQgbWlnaHQgYmUgZGlzYWJsZWQsIGUuZy4gdXNlciBpcyBpbiBwcml2YXRlIG1vZGUpXG4gICAgLy8gc2VlOiBodHRwczovL2dpdGh1Yi5jb20vU2Vsei9wbHlyL2lzc3Vlcy8xMzFcbiAgICB0cnkge1xuICAgICAgICAvLyBBZGQgdGVzdCBpdGVtXG4gICAgICAgIHdpbmRvdy5sb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnX19fdGVzdCcsICdPSycpO1xuXG4gICAgICAgIC8vIEdldCB0aGUgdGVzdCBpdGVtXG4gICAgICAgIHZhciByZXN1bHQgPSB3aW5kb3cubG9jYWxTdG9yYWdlLmdldEl0ZW0oJ19fX3Rlc3QnKTtcblxuICAgICAgICAvLyBDbGVhbiB1cFxuICAgICAgICB3aW5kb3cubG9jYWxTdG9yYWdlLnJlbW92ZUl0ZW0oJ19fX3Rlc3QnKTtcblxuICAgICAgICAvLyBDaGVjayBpZiB2YWx1ZSBtYXRjaGVzXG4gICAgICAgIHJldHVybiAocmVzdWx0ID09PSAnT0snKTtcbiAgICB9XG4gICAgY2F0Y2ggKGUpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbn1cbiIsImltcG9ydCB7IFNlZ21lbnRNYXAgfSBmcm9tICcuLi91dGlscy9zZWdtZW50LW1hcCc7XG5pbXBvcnQgeyBTdHJpbmdNYXAgfSBmcm9tICcuLi91dGlscy9zdHJpbmctbWFwJztcblxuY29uc3QgZW51bSBUdlJhdGluZyB7XG4gICAgTm90QXZhaWxhYmxlID0gLTEsXG4gICAgTm90QXBwbGljYWJsZSA9IDAsXG4gICAgVFZfWSA9IDEsXG4gICAgVFZfWTcgPSAyLFxuICAgIFRWX0cgPSAzLFxuICAgIFRWX1BHID0gNCxcbiAgICBUVl8xNCA9IDUsXG4gICAgVFZfTUEgPSA2LFxuICAgIE5vdFJhdGVkID0gN1xufVxuXG5jb25zdCBlbnVtIE1vdmllUmF0aW5nIHtcbiAgICBOb3RBdmFpbGFibGUgPSAtMSxcbiAgICBOb3RBcHBsaWNhYmxlID0gMCxcbiAgICBHID0gMSxcbiAgICBQRyA9IDIsXG4gICAgUEdfMTMgPSAzLFxuICAgIFIgPSA0LFxuICAgIE5DXzE3ID0gNSxcbiAgICBYID0gNixcbiAgICBOb3RSYXRlZCA9IDdcbn1cblxuZXhwb3J0IGludGVyZmFjZSBUaHVtYiB7XG4gICAgd2lkdGg6IG51bWJlcjtcbiAgICBwcmVmaXg6IHN0cmluZztcbiAgICBoZWlnaHQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdG9yYWdlUGFyaXRpb24ge1xuICAgIC8qKlxuICAgICAqIFN0YXJ0aW5nIHNsaWNlIG51bWJlciwgaW5jbHVzaXZlXG4gICAgICovXG4gICAgc3RhcnQ6IG51bWJlcjtcblxuICAgIC8qKlxuICAgICAqIEVuZGluZyBzbGljZSBudW1iZXIsIGV4Y2x1c2l2ZVxuICAgICAqL1xuICAgIGVuZDogbnVtYmVyO1xuICAgIHVybDogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgQXNzZXRJbmZvU2VyaWFsaXplZCB7XG4gICAgYXVkaW9fb25seTogbnVtYmVyO1xuICAgIGVycm9yOiBudW1iZXI7XG4gICAgdHZfcmF0aW5nOiBudW1iZXI7XG4gICAgc3RvcmFnZV9wYXJ0aXRpb25zOiBTdG9yYWdlUGFyaXRpb25bXTtcbiAgICBtYXhfc2xpY2U6IG51bWJlcjtcbiAgICB0aHVtYl9wcmVmaXg6IHN0cmluZztcbiAgICBhZF9kYXRhOiBPYmplY3Q7XG4gICAgc2xpY2VfZHVyOiBudW1iZXI7XG4gICAgbW92aWVfcmF0aW5nOiBudW1iZXI7XG4gICAgb3duZXI6IHN0cmluZztcbiAgICByYXRlczogbnVtYmVyW107XG4gICAgdGh1bWJzOiBUaHVtYltdO1xuICAgIHBvc3Rlcl91cmw6IHN0cmluZztcbiAgICBkdXJhdGlvbjogbnVtYmVyO1xuICAgIGRlZmF1bHRfcG9zdGVyX3VybDogc3RyaW5nO1xuICAgIGRlc2M6IHN0cmluZztcbiAgICByYXRpbmdfZmxhZ3M6IG51bWJlcjtcbiAgICBleHRlcm5hbF9pZDogc3RyaW5nO1xuICAgIGlzX2FkOiBudW1iZXI7XG4gICAgYXNzZXQ6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIEFkRGF0YSB7XG4gICAgY2xpY2s/OiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGNsYXNzIEFzc2V0SW5mbyB7XG4gICAgcmVhZG9ubHkgYXVkaW9Pbmx5OiBib29sZWFuO1xuICAgIHJlYWRvbmx5IGVycm9yOiBib29sZWFuO1xuICAgIHJlYWRvbmx5IHR2UmF0aW5nOiBUdlJhdGluZztcbiAgICByZWFkb25seSBzdG9yYWdlUGFydGl0aW9uczogU3RvcmFnZVBhcml0aW9uW107XG4gICAgcmVhZG9ubHkgbWF4U2xpY2U6IG51bWJlcjtcbiAgICByZWFkb25seSB0aHVtYlByZWZpeDogc3RyaW5nO1xuICAgIHJlYWRvbmx5IGFkRGF0YTogQWREYXRhO1xuICAgIHJlYWRvbmx5IHNsaWNlRHVyYXRpb246IG51bWJlcjtcbiAgICByZWFkb25seSBtb3ZpZVJhdGluZzogTW92aWVSYXRpbmc7XG4gICAgcmVhZG9ubHkgb3duZXI6IHN0cmluZztcbiAgICByZWFkb25seSByYXRlczogbnVtYmVyW107XG4gICAgcmVhZG9ubHkgdGh1bWJzOiBUaHVtYltdO1xuICAgIHJlYWRvbmx5IHBvc3RlclVybDogc3RyaW5nO1xuICAgIHJlYWRvbmx5IGR1cmF0aW9uOiBudW1iZXI7XG4gICAgcmVhZG9ubHkgZGVmYXVsdFBvc3RlclVybDogc3RyaW5nO1xuICAgIHJlYWRvbmx5IGRlc2NyaXB0aW9uOiBzdHJpbmc7XG4gICAgcmVhZG9ubHkgcmF0aW5nRmxhZ3M6IG51bWJlcjtcbiAgICByZWFkb25seSBleHRlcm5hbElkOiBzdHJpbmc7XG4gICAgcmVhZG9ubHkgaXNBZDogYm9vbGVhbjtcbiAgICByZWFkb25seSBhc3NldDogc3RyaW5nO1xuXG4gICAgY29uc3RydWN0b3Iob2JqOiBBc3NldEluZm9TZXJpYWxpemVkLCBpc0FkOiBib29sZWFuIHwgbnVsbCkge1xuICAgICAgICB0aGlzLmF1ZGlvT25seSA9IG9iai5hdWRpb19vbmx5ID09IDE7XG4gICAgICAgIHRoaXMuZXJyb3IgPSBvYmouZXJyb3IgPT0gMTtcbiAgICAgICAgdGhpcy50dlJhdGluZyA9IG9iai50dl9yYXRpbmc7XG4gICAgICAgIHRoaXMuc3RvcmFnZVBhcnRpdGlvbnMgPSBvYmouc3RvcmFnZV9wYXJ0aXRpb25zO1xuICAgICAgICB0aGlzLm1heFNsaWNlID0gb2JqLm1heF9zbGljZTtcbiAgICAgICAgdGhpcy50aHVtYlByZWZpeCA9IG9iai50aHVtYl9wcmVmaXg7XG4gICAgICAgIHRoaXMuYWREYXRhID0gb2JqLmFkX2RhdGE7XG4gICAgICAgIHRoaXMuc2xpY2VEdXJhdGlvbiA9IG9iai5zbGljZV9kdXI7XG4gICAgICAgIHRoaXMubW92aWVSYXRpbmcgPSBvYmoubW92aWVfcmF0aW5nO1xuICAgICAgICB0aGlzLm93bmVyID0gb2JqLm93bmVyO1xuICAgICAgICB0aGlzLnJhdGVzID0gb2JqLnJhdGVzO1xuICAgICAgICB0aGlzLnRodW1icyA9IG9iai50aHVtYnM7XG4gICAgICAgIHRoaXMucG9zdGVyVXJsID0gb2JqLnBvc3Rlcl91cmw7XG4gICAgICAgIHRoaXMuZHVyYXRpb24gPSBvYmouZHVyYXRpb247XG4gICAgICAgIHRoaXMuZGVmYXVsdFBvc3RlclVybCA9IG9iai5kZWZhdWx0X3Bvc3Rlcl91cmw7XG4gICAgICAgIHRoaXMuZGVzY3JpcHRpb24gPSBvYmouZGVzYztcbiAgICAgICAgdGhpcy5yYXRpbmdGbGFncyA9IG9iai5yYXRpbmdfZmxhZ3M7XG4gICAgICAgIHRoaXMuZXh0ZXJuYWxJZCA9IG9iai5leHRlcm5hbF9pZDtcbiAgICAgICAgdGhpcy5hc3NldCA9IG9iai5hc3NldDtcblxuICAgICAgICAvL3VzZSB2YWx1ZSBmcm9tIFNlZ21lbnRNYXAgaWYgYXZhaWxhYmxlICgjMTE4LCBVUC00MzU0KVxuICAgICAgICBpZiAoaXNBZCA9PSBudWxsKSB7XG4gICAgICAgICAgICB0aGlzLmlzQWQgPSBvYmouaXNfYWQgPT09IDE7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmlzQWQgPSBpc0FkO1xuICAgICAgICB9XG5cbiAgICAgICAgLy9zb3J0IHRodW1icyBieSBpbWFnZSB3aWR0aCwgc21hbGxlc3QgdG8gbGFyZ2VzdFxuICAgICAgICAvLyB0aHVtYnMgbWF5IGJlIHVuZGVmaW5lZCB3aGVuIHBsYXlpbmcgYW4gYXVkaW8tb25seSBhc3NldFxuICAgICAgICBpZiAodGhpcy50aHVtYnMpIHtcbiAgICAgICAgICAgIHRoaXMudGh1bWJzLnNvcnQoZnVuY3Rpb24gKGxlZnQ6IFRodW1iLCByaWdodDogVGh1bWIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbGVmdC53aWR0aCAtIHJpZ2h0LndpZHRoO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICAvL2NsYW1wIHN0b3JhZ2UgcGFydGl0aW9uIHNsaWNlIGVuZCBudW1iZXJzIGFzIHRoZXkgY2FuIGJlIGxhcmdlciB0aGFuXG4gICAgICAgIC8vIGphdmFzY3JpcHQgY2FuIHNhZmVseSByZXByZXNlbnRcbiAgICAgICAgaWYgKHRoaXMuc3RvcmFnZVBhcnRpdGlvbnMgJiYgdGhpcy5zdG9yYWdlUGFydGl0aW9ucy5sZW5ndGgpIHtcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5zdG9yYWdlUGFydGl0aW9ucy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIC8vTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIgPT09IDkwMDcxOTkyNTQ3NDA5OTFcbiAgICAgICAgICAgICAgICAvL051bWJlci5NQVhfU0FGRV9JTlRFR0VSIG5vdCBzdXBwb3J0ZWQgaW4gSUVcbiAgICAgICAgICAgICAgICB0aGlzLnN0b3JhZ2VQYXJ0aXRpb25zW2ldLmVuZCA9IE1hdGgubWluKHRoaXMuc3RvcmFnZVBhcnRpdGlvbnNbaV0uZW5kLCA5MDA3MTk5MjU0NzQwOTkxKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn1cblxuZXhwb3J0IGNsYXNzIEFzc2V0SW5mb1NlcnZpY2Uge1xuICAgIHByaXZhdGUgcmVhZG9ubHkgX2RvbWFpbjogc3RyaW5nO1xuICAgIHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25JZDogc3RyaW5nO1xuICAgIHByaXZhdGUgcmVhZG9ubHkgX2NhY2hlOiBTdHJpbmdNYXA8QXNzZXRJbmZvPjtcblxuICAgIGNvbnN0cnVjdG9yKGRvbWFpbjogc3RyaW5nLCBzZXNzaW9uSWQ/OiBzdHJpbmcpIHtcbiAgICAgICAgdGhpcy5fZG9tYWluID0gZG9tYWluO1xuICAgICAgICB0aGlzLl9zZXNzaW9uSWQgPSBzZXNzaW9uSWQ7XG4gICAgICAgIHRoaXMuX2NhY2hlID0gbmV3IFN0cmluZ01hcDxBc3NldEluZm8+KCk7XG5cbiAgICAgICAgdGhpcy5fbG9hZFNlZ21lbnRzID0gdGhpcy5fbG9hZFNlZ21lbnRzLmJpbmQodGhpcyk7XG4gICAgfVxuXG4gICAgbG9hZFNlZ21lbnRNYXAoc2VnbWVudE1hcDogU2VnbWVudE1hcCwgY2FsbGJhY2s6ICgpID0+IHZvaWQpOiB2b2lkIHtcbiAgICAgICAgbGV0IHNlZ21lbnRzOiBTZWdtZW50W10gPSBbXTtcblxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHNlZ21lbnRNYXAubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGxldCBzZWdtZW50ID0gc2VnbWVudE1hcC5nZXRTZWdtZW50QXQoaSk7XG4gICAgICAgICAgICBzZWdtZW50cy5wdXNoKHNlZ21lbnQpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fbG9hZFNlZ21lbnRzKHNlZ21lbnRzLCBjYWxsYmFjayk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfbG9hZFNlZ21lbnRzKHNlZ21lbnRzOiBTZWdtZW50W10sIGNhbGxiYWNrOiAoKSA9PiB2b2lkKTogdm9pZCB7XG4gICAgICAgIGlmIChzZWdtZW50cy5sZW5ndGggPT0gMCkge1xuICAgICAgICAgICAgY2FsbGJhY2soKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBzZWdtZW50ID0gc2VnbWVudHMuc2hpZnQoKTtcbiAgICAgICAgdGhpcy5sb2FkU2VnbWVudChzZWdtZW50LCAoKSA9PiB7XG4gICAgICAgICAgICB0aGlzLl9sb2FkU2VnbWVudHMoc2VnbWVudHMsIGNhbGxiYWNrKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy9sb2FkKGFzc2V0SWQ6IHN0cmluZywgY2FsbEJhY2s6IChhc3NldEluZm86IEFzc2V0SW5mbykgPT4gdm9pZCk6IHZvaWQge1xuICAgIGxvYWRBc3NldElkKGFzc2V0SWQ6IHN0cmluZywgaXNBZDogYm9vbGVhbiB8IG51bGwsIGNhbGxCYWNrOiAoYXNzZXRJbmZvOiBBc3NldEluZm8pID0+IHZvaWQpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuaXNMb2FkZWQoYXNzZXRJZCkpIHtcbiAgICAgICAgICAgIC8vYXNzZXRJbmZvIGZvciBhc3NldElkIGlzIGFscmVhZHkgbG9hZGVkXG4gICAgICAgICAgICBsZXQgaW5mbyA9IHRoaXMuX2NhY2hlLmdldChhc3NldElkKTtcbiAgICAgICAgICAgIGNhbGxCYWNrKGluZm8pO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IHVybCA9IGAvLyR7dGhpcy5fZG9tYWlufS9wbGF5ZXIvYXNzZXRpbmZvLyR7YXNzZXRJZH0uanNvbmA7XG5cbiAgICAgICAgaWYgKHRoaXMuX3Nlc3Npb25JZCAmJiB0aGlzLl9zZXNzaW9uSWQgIT0gXCJcIikge1xuICAgICAgICAgICAgdXJsID0gYCR7dXJsfT9wYnM9JHt0aGlzLl9zZXNzaW9uSWR9YDtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciB4aHIgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcbiAgICAgICAgeGhyLm9ubG9hZCA9ICgpOiB2b2lkID0+IHtcbiAgICAgICAgICAgIGlmICh4aHIuc3RhdHVzID09IDIwMCkge1xuICAgICAgICAgICAgICAgIGxldCBvYmogPSBKU09OLnBhcnNlKHhoci5yZXNwb25zZVRleHQpO1xuICAgICAgICAgICAgICAgIGxldCBhc3NldEluZm8gPSBuZXcgQXNzZXRJbmZvKG9iaiwgaXNBZCk7XG5cbiAgICAgICAgICAgICAgICAvL2FkZCBhc3NldEluZm8gdG8gY2FjaGVcbiAgICAgICAgICAgICAgICB0aGlzLl9jYWNoZS5zZXQoYXNzZXRJZCwgYXNzZXRJbmZvKTtcblxuICAgICAgICAgICAgICAgIGNhbGxCYWNrKGFzc2V0SW5mbyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgeGhyLm9wZW4oXCJHRVRcIiwgdXJsKTtcbiAgICAgICAgeGhyLnNlbmQoKTtcbiAgICB9XG5cbiAgICBsb2FkU2VnbWVudChzZWdtZW50OiBTZWdtZW50LCBjYWxsQmFjazogKGFzc2V0SW5mbzogQXNzZXRJbmZvKSA9PiB2b2lkKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGFzc2V0SWQ6IHN0cmluZyA9IHNlZ21lbnQuaWQ7XG4gICAgICAgIGNvbnN0IGlzQWQgPSBTZWdtZW50TWFwLmlzQWQoc2VnbWVudCk7XG5cbiAgICAgICAgdGhpcy5sb2FkQXNzZXRJZChhc3NldElkLCBpc0FkLCBjYWxsQmFjayk7XG4gICAgfVxuXG4gICAgaXNMb2FkZWQoYXNzZXRJZDogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLl9jYWNoZS5oYXMoYXNzZXRJZCk7XG4gICAgfVxuXG4gICAgZ2V0QXNzZXRJbmZvKGFzc2V0SWQ6IHN0cmluZyk6IEFzc2V0SW5mbyB7XG4gICAgICAgIGlmICh0aGlzLmlzTG9hZGVkKGFzc2V0SWQpKSB7XG4gICAgICAgICAgICBsZXQgaW5mbyA9IHRoaXMuX2NhY2hlLmdldChhc3NldElkKTtcbiAgICAgICAgICAgIHJldHVybiBpbmZvO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICBjbGVhcigpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5fY2FjaGUuY2xlYXIoKTtcbiAgICB9XG59XG4iLCJleHBvcnQgY2xhc3MgUGluZ1NlcnZpY2Uge1xuICAgIHByaXZhdGUgcmVhZG9ubHkgX2RvbWFpbjogc3RyaW5nO1xuICAgIHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25JZDogc3RyaW5nO1xuICAgIHByaXZhdGUgcmVhZG9ubHkgX3ZpZGVvOiBIVE1MVmlkZW9FbGVtZW50O1xuXG4gICAgcHJpdmF0ZSBfcGluZ1NlcnZlcjogYm9vbGVhbjtcbiAgICBwcml2YXRlIF9zZW50U3RhcnRQaW5nOiBib29sZWFuO1xuICAgIHByaXZhdGUgX3NlZWtpbmc6IGJvb2xlYW47XG5cbiAgICBwcml2YXRlIF9jdXJyZW50VGltZTogbnVtYmVyO1xuICAgIHByaXZhdGUgX3NlZWtGcm9tVGltZTogbnVtYmVyO1xuICAgIHByaXZhdGUgX25leHRUaW1lOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cbiAgICBwcml2YXRlIHJlYWRvbmx5IFNUQVJUID0gXCJzdGFydFwiO1xuICAgIHByaXZhdGUgcmVhZG9ubHkgU0VFSyA9IFwic2Vla1wiO1xuXG4gICAgY29uc3RydWN0b3IoZG9tYWluOiBzdHJpbmcsIHNlc3Npb25JZDogc3RyaW5nLCB2aWRlbzogSFRNTFZpZGVvRWxlbWVudCkge1xuXG4gICAgICAgIHRoaXMuX2RvbWFpbiA9IGRvbWFpbjtcbiAgICAgICAgdGhpcy5fc2Vzc2lvbklkID0gc2Vzc2lvbklkO1xuICAgICAgICB0aGlzLl92aWRlbyA9IHZpZGVvO1xuXG4gICAgICAgIHRoaXMuX3BpbmdTZXJ2ZXIgPSBzZXNzaW9uSWQgIT0gbnVsbCAmJiBzZXNzaW9uSWQgIT0gXCJcIjtcbiAgICAgICAgdGhpcy5fbmV4dFRpbWUgPSB1bmRlZmluZWQ7XG5cbiAgICAgICAgdGhpcy5fc2VudFN0YXJ0UGluZyA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9zZWVraW5nID0gZmFsc2U7XG5cbiAgICAgICAgdGhpcy5fY3VycmVudFRpbWUgPSAwLjA7XG4gICAgICAgIHRoaXMuX3NlZWtGcm9tVGltZSA9IDAuMDtcblxuICAgICAgICB0aGlzLl92aWRlbyA9IHZpZGVvO1xuXG4gICAgICAgIHRoaXMuX29uUGxheWVyUG9zaXRpb25DaGFuZ2VkID0gdGhpcy5fb25QbGF5ZXJQb3NpdGlvbkNoYW5nZWQuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5fb25TdGFydCA9IHRoaXMuX29uU3RhcnQuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5fb25TZWVrZWQgPSB0aGlzLl9vblNlZWtlZC5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLl9vblNlZWtpbmcgPSB0aGlzLl9vblNlZWtpbmcuYmluZCh0aGlzKTtcblxuICAgICAgICBpZiAodGhpcy5fcGluZ1NlcnZlcikge1xuICAgICAgICAgICAgdGhpcy5fdmlkZW8uYWRkRXZlbnRMaXN0ZW5lcigndGltZXVwZGF0ZScsIHRoaXMuX29uUGxheWVyUG9zaXRpb25DaGFuZ2VkKTtcbiAgICAgICAgICAgIHRoaXMuX3ZpZGVvLmFkZEV2ZW50TGlzdGVuZXIoJ3BsYXlpbmcnLCB0aGlzLl9vblN0YXJ0KTtcbiAgICAgICAgICAgIHRoaXMuX3ZpZGVvLmFkZEV2ZW50TGlzdGVuZXIoJ3NlZWtlZCcsIHRoaXMuX29uU2Vla2VkKTtcbiAgICAgICAgICAgIHRoaXMuX3ZpZGVvLmFkZEV2ZW50TGlzdGVuZXIoJ3NlZWtpbmcnLCB0aGlzLl9vblNlZWtpbmcpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfY3JlYXRlUXVlcnlTdHJpbmcoZXZlbnQ6IHN0cmluZywgY3VycmVudFBvc2l0aW9uOiBudW1iZXIsIGZyb21Qb3NpdGlvbj86IG51bWJlcikge1xuICAgICAgICBjb25zdCBWRVJTSU9OID0gMztcblxuICAgICAgICBpZiAoZXZlbnQpIHtcbiAgICAgICAgICAgIGxldCBzdHIgPSBgdj0ke1ZFUlNJT059JmV2PSR7ZXZlbnR9JnB0PSR7Y3VycmVudFBvc2l0aW9ufWA7XG5cbiAgICAgICAgICAgIGlmIChmcm9tUG9zaXRpb24pIHtcbiAgICAgICAgICAgICAgICBzdHIgKz0gYCZmdD0ke2Zyb21Qb3NpdGlvbn1gO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gc3RyO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGB2PSR7VkVSU0lPTn0mcHQ9JHtjdXJyZW50UG9zaXRpb259YDtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vblN0YXJ0KCkge1xuICAgICAgICBpZiAodGhpcy5fcGluZ1NlcnZlciAmJiAhdGhpcy5fc2VudFN0YXJ0UGluZykge1xuICAgICAgICAgICAgdGhpcy5fc2VuZFBpbmcodGhpcy5TVEFSVCwgMCk7XG4gICAgICAgICAgICB0aGlzLl9zZW50U3RhcnRQaW5nID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgX29uU2Vla2luZygpIHtcbiAgICAgICAgdGhpcy5fc2Vla2luZyA9IHRydWU7XG4gICAgICAgIHRoaXMuX25leHRUaW1lID0gdW5kZWZpbmVkO1xuICAgICAgICB0aGlzLl9zZWVrRnJvbVRpbWUgPSB0aGlzLl9jdXJyZW50VGltZTtcbiAgICB9XG5cbiAgICBwcml2YXRlIF9vblNlZWtlZCgpIHtcbiAgICAgICAgaWYgKHRoaXMuX3BpbmdTZXJ2ZXIgJiYgdGhpcy5fc2Vla2luZyAmJiB0aGlzLl9zZWVrRnJvbVRpbWUpIHtcbiAgICAgICAgICAgIHRoaXMuX3NlbmRQaW5nKHRoaXMuU0VFSywgdGhpcy5fY3VycmVudFRpbWUsIHRoaXMuX3NlZWtGcm9tVGltZSk7XG4gICAgICAgICAgICB0aGlzLl9zZWVraW5nID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLl9zZWVrRnJvbVRpbWUgPSB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIF9vblBsYXllclBvc2l0aW9uQ2hhbmdlZCgpIHtcbiAgICAgICAgdGhpcy5fY3VycmVudFRpbWUgPSB0aGlzLl92aWRlby5jdXJyZW50VGltZTtcblxuICAgICAgICBpZiAodGhpcy5fcGluZ1NlcnZlciAmJiAhdGhpcy5fc2Vla2luZyAmJiB0aGlzLl9uZXh0VGltZSAmJiB0aGlzLl9jdXJyZW50VGltZSA+IHRoaXMuX25leHRUaW1lKSB7XG4gICAgICAgICAgICB0aGlzLl9uZXh0VGltZSA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIHRoaXMuX3NlbmRQaW5nKG51bGwsIHRoaXMuX2N1cnJlbnRUaW1lKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgX3NlbmRQaW5nKGV2ZW50OiBzdHJpbmcsIGN1cnJlbnRQb3NpdGlvbjogbnVtYmVyLCBmcm9tUG9zaXRpb24/OiBudW1iZXIpIHtcbiAgICAgICAgbGV0IHVybCA9IGAvLyR7dGhpcy5fZG9tYWlufS9zZXNzaW9uL3BpbmcvJHt0aGlzLl9zZXNzaW9uSWR9Lmpzb24/JHt0aGlzLl9jcmVhdGVRdWVyeVN0cmluZyhldmVudCwgY3VycmVudFBvc2l0aW9uLCBmcm9tUG9zaXRpb24pfWA7XG5cbiAgICAgICAgdmFyIHhociA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xuICAgICAgICB4aHIub3BlbihcIkdFVFwiLCB1cmwsIHRydWUpO1xuICAgICAgICB4aHIucmVzcG9uc2VUeXBlID0gXCJ0ZXh0XCI7XG5cbiAgICAgICAgeGhyLm9ubG9hZCA9ICgpID0+IHtcbiAgICAgICAgICAgIGlmICh4aHIuc3RhdHVzID09IDIwMCkge1xuICAgICAgICAgICAgICAgIGxldCBqc29uID0gSlNPTi5wYXJzZSh4aHIucmVzcG9uc2VUZXh0KTtcbiAgICAgICAgICAgICAgICB0aGlzLl9uZXh0VGltZSA9IGpzb24ubmV4dF90aW1lO1xuXG4gICAgICAgICAgICAgICAgLy9hYnNlbmNlIG9mIGVycm9yIHByb3BlcnR5IGluZGljYXRlcyBubyBlcnJvclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLl9uZXh0VGltZSA8IDAgfHwganNvbi5oYXNPd25Qcm9wZXJ0eSgnZXJyb3InKSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9waW5nU2VydmVyID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX25leHRUaW1lID0gdW5kZWZpbmVkO1xuXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3ZpZGVvLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3RpbWV1cGRhdGUnLCB0aGlzLl9vblBsYXllclBvc2l0aW9uQ2hhbmdlZCk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3ZpZGVvLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3BsYXlpbmcnLCB0aGlzLl9vblN0YXJ0KTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fdmlkZW8ucmVtb3ZlRXZlbnRMaXN0ZW5lcignc2Vla2VkJywgdGhpcy5fb25TZWVrZWQpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl92aWRlby5yZW1vdmVFdmVudExpc3RlbmVyKCdzZWVraW5nJywgdGhpcy5fb25TZWVraW5nKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgeGhyLnNlbmQoKTtcbiAgICB9XG59Il19
